"""Deployment control-flow tests with real temporary Git repos and fake npm/PM2/HTTP.

python ops/deploy/test_deploy.py [path-to-bash]
Never connects to production. Linux flock/SSH and real dependency installs remain
integration checks for the first Actions run.
"""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

BASH = sys.argv[1] if len(sys.argv) > 1 else shutil.which('bash')
if not BASH:
    raise SystemExit('Bash is required')
SOURCE = Path(__file__).with_name('deploy.sh').read_text(encoding='utf-8')


def run_case(case):
    with tempfile.TemporaryDirectory(prefix='bm-deploy-test-') as td:
        base = Path(td)
        app, state, fake = [base / name for name in ('app', 'state', 'bin')]
        for directory in (app, state, fake):
            directory.mkdir()
        env = os.environ.copy()
        env.update(GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL=os.devnull,
                   MOCK_CASE=case, MOCK_PM2=str(base / 'pm2.log'))

        def git(*args):
            return subprocess.check_output(['git', '-C', str(app), *args], env=env,
                                           stderr=subprocess.DEVNULL, text=True).strip()

        def write(path, content):
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding='utf-8', newline='\n')

        git('init', '-b', 'main', '--template=')
        git('config', 'user.name', 'Deployment Test')
        git('config', 'user.email', 'test@example.invalid')
        git('config', 'core.autocrlf', 'false')
        write(app / '.gitignore', 'node_modules/\nfrontend/dist/\n.env\nuploads/\n')
        for name in ('package.json', 'package-lock.json', 'frontend/package-lock.json'):
            write(app / name, '{}\n')
        write(app / 'backend/server.js', '// old\n')
        write(app / 'frontend/src.js', '// old\n')
        git('add', '.')
        git('commit', '-qm', 'old')
        old = git('rev-parse', 'HEAD')
        if case in ('backend', 'health-failure', 'dependencies', 'manual-rollback'):
            write(app / 'backend/server.js', '// new\n')
        else:
            write(app / 'frontend/src.js', '// new\n')
        if case == 'dependencies':
            write(app / 'package-lock.json', '{"changed":true}\n')
        git('add', '.')
        git('commit', '-qm', 'new')
        new = git('rev-parse', 'HEAD')
        origin = base / 'origin.git'
        subprocess.check_call(['git', 'clone', '--bare', str(app), str(origin)],
                              env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        git('remote', 'add', 'origin', str(origin))
        git('reset', '--hard', old)
        for name in ('node_modules/marker', 'frontend/node_modules/marker',
                     'frontend/dist/index.html', 'frontend/dist/assets/old.js'):
            write(app / name, 'old\n')
        write(app / '.env', 'DO_NOT_TOUCH=test\n')
        write(app / 'uploads/customer.pdf', 'preserve\n')
        if case == 'dirty':
            write(app / 'backend/server.js', '// operator change\n')
        if case == 'manual-rollback':
            git('reset', '--hard', new)
        env['MOCK_BAD_SHA'] = new

        mocks = {
            'node': 'if [ "$1" = -p ]; then echo 22; fi\n',
            'pm2': 'echo "$*" >> "$MOCK_PM2"\n',
            'flock': 'exit 0\n',
            'curl': '''head=$(git rev-parse HEAD)
if { [ "$MOCK_CASE" = health-failure ] || [ "$MOCK_CASE" = dependencies ]; } && [ "$head" = "$MOCK_BAD_SHA" ]; then echo 503; else echo 200; fi
''',
            'npm': '''if [ "$1" = ci ]; then mkdir -p node_modules; echo new > node_modules/marker; exit 0; fi
if [ "$MOCK_CASE" = build-failure ]; then exit 1; fi
mkdir -p frontend/dist/assets
echo new > frontend/dist/index.html
echo new > frontend/dist/assets/new.js
''',
        }
        if os.name == 'nt':
            # Minimal bundled MSYS lacks chmod; ACLs are a Linux setup check.
            mocks['chmod'] = 'exit 0\n'
        for name, body in mocks.items():
            file = fake / name
            write(file, '#!/bin/sh\nset -eu\n' + body)
            file.chmod(0o755)

        # Change only host constants/privilege requirement and polling delay in
        # the copy under test. Production source remains unchanged.
        def shell_path(path):
            value = str(path).replace('\\', '/')
            if os.name == 'nt':
                value = '/' + value[0].lower() + value[2:]
            return value

        app_path = str(app).replace('\\', '/')
        script = SOURCE.replace('APP=/var/www/benimmarketim', f'APP="{app_path}"')
        script = script.replace('STATE=/var/lib/benimmarketim-deploy', f'STATE="{shell_path(state)}"')
        script = script.replace('export PATH=/opt/benimmarketim-node22/bin:/usr/local/bin:/usr/bin:/bin',
                                f'export PATH="{shell_path(fake)}:{shell_path(Path(BASH).resolve().parent)}:$PATH"')
        script = script.replace('[[ $EUID == 0 && $# == 3 ]]', '[[ $# == 3 ]]')
        script = script.replace('SECONDS + 60', 'SECONDS + 2').replace('sleep 2', 'sleep 0.05')
        runner = base / 'deploy-test.sh'
        write(runner, script)
        mode = 'rollback' if case == 'manual-rollback' else 'deploy'
        target = old if case in ('stale', 'manual-rollback') else new
        proc = subprocess.run([BASH, str(runner), mode, target, app_path],
                              env=env, capture_output=True, text=True, timeout=40)
        success = case in ('frontend', 'backend', 'manual-rollback')
        if (proc.returncode == 0) != success:
            logs = '\n'.join(p.read_text(errors='replace') for p in state.glob('*/deploy.log'))
            raise AssertionError(f'{case}: {proc.stdout}\n{proc.stderr}\n{logs}')
        expected = new if case in ('frontend', 'backend') else old
        assert git('rev-parse', 'HEAD') == expected, case
        assert (app / '.env').read_text() == 'DO_NOT_TOUCH=test\n', case
        assert (app / 'uploads/customer.pdf').read_text() == 'preserve\n', case
        assert (app / 'node_modules/marker').read_text() == 'old\n', case
        pm2 = (base / 'pm2.log').read_text() if (base / 'pm2.log').exists() else ''
        if case == 'frontend':
            assert 'reload' not in pm2
            assert (app / 'frontend/dist/assets/old.js').exists()
            assert (app / 'frontend/dist/index.html').read_text() == 'new\n'
        elif case in ('backend', 'manual-rollback'):
            assert 'reload benimmarketim-api' in pm2
        else:
            assert (app / 'frontend/dist/index.html').read_text() == 'old\n'
        if case == 'dirty':
            assert (app / 'backend/server.js').read_text() == '// operator change\n'
        print(f'PASS {case}')


for scenario in ('frontend', 'backend', 'build-failure', 'health-failure',
                 'dirty', 'dependencies', 'stale', 'manual-rollback'):
    run_case(scenario)
