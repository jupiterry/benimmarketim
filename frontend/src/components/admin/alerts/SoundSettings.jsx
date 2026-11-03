import { useEffect, useRef, useState } from "react";
import { Play, Square, Volume2, VolumeX } from "lucide-react";
import { alertPrefs, useAlertPrefs } from "./alertPrefs";
import { previewSound, stopPreview, unlockWithSound, useAudioState } from "./alertAudio";
import { REPEAT_INTERVALS, SOUND_OPTIONS, intervalLabel } from "./alertRules";

const permissionOf = () => (typeof window !== "undefined" && "Notification" in window ? window.Notification.permission : "unsupported");

/**
 * Bildirim sesi ayarları (başlıktaki zil panelinde). Tercihler bu cihaza özeldir.
 * autoFocus: hesap menüsünden "Bildirim sesi" ile açıldıysa ilk alan odaklanır.
 */
export default function SoundSettings({ autoFocus = false }) {
  const prefs = useAlertPrefs();
  const { blocked, previewing } = useAudioState();
  const [permission, setPermission] = useState(permissionOf);
  const selectRef = useRef(null);
  const silent = prefs.muted || prefs.volume <= 0;

  useEffect(() => {
    if (autoFocus) selectRef.current?.focus();
  }, [autoFocus]);
  // Panel kapanınca deneme sesi susar
  useEffect(() => () => stopPreview(), []);

  const update = (patch) => alertPrefs.set(patch);
  const test = () => {
    if (previewing) {
      stopPreview();
      return;
    }
    // Sessizdeyken de denenebilir (seçilen düzeyde); düzey %0 ise duyulmaz
    previewSound({ sound: prefs.sound, volume: prefs.volume });
  };
  const toggleMuted = () => {
    if (!silent) {
      update({ muted: true });
      stopPreview();
      return;
    }
    // Ses açılırken düzey %0 ise duyulur bir düzeye getirilir; kısa bir parça çalınır (tarayıcı kilidi de açılır)
    const volume = prefs.volume > 0 ? prefs.volume : 0.75;
    update({ muted: false, volume });
    unlockWithSound({ sound: prefs.sound, volume });
  };
  const askPermission = async () => {
    try {
      const result = await window.Notification.requestPermission();
      setPermission(result);
    } catch {
      setPermission(permissionOf());
    }
  };

  return (
    <div className="app-sound" role="group" aria-label="Bildirim sesi ayarları">
      <div className="app-sound-row app-sound-row--switch">
        <span className="app-sound-label">
          {silent ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
          Yeni sipariş sesi
        </span>
        <button type="button" role="switch" aria-checked={!silent} className="app-switch" onClick={toggleMuted}>
          <span className="app-switch-track" aria-hidden="true"><span className="app-switch-thumb" /></span>
          <span className="app-switch-text">{silent ? "Kapalı" : "Açık"}</span>
        </button>
      </div>

      <div className="app-sound-field">
        <span id="app-sound-pick-label">Ses</span>
        <div className="app-sound-pick">
          <select
            ref={selectRef}
            value={prefs.sound}
            onChange={(event) => {
              stopPreview();
              update({ sound: event.target.value });
            }}
            aria-labelledby="app-sound-pick-label"
          >
            {SOUND_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
          <button type="button" className="app-sound-test" onClick={test} aria-pressed={previewing}>
            {previewing ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}
            {previewing ? "Durdur" : "Dene"}
          </button>
        </div>
      </div>

      <label className="app-sound-field">
        <span>
          Ses düzeyi <b className="ui-num">%{Math.round(prefs.volume * 100)}</b>
        </span>
        <input
          type="range"
          min="0"
          max="100"
          step="5"
          value={Math.round(prefs.volume * 100)}
          onChange={(event) => update({ volume: Number(event.target.value) / 100 })}
          aria-valuetext={`%${Math.round(prefs.volume * 100)}`}
        />
      </label>

      <div className="app-sound-row app-sound-row--switch">
        <span className="app-sound-label">Sipariş bekledikçe tekrar çal</span>
        <button type="button" role="switch" aria-checked={prefs.repeat} className="app-switch" onClick={() => update({ repeat: !prefs.repeat })}>
          <span className="app-switch-track" aria-hidden="true"><span className="app-switch-thumb" /></span>
          <span className="app-switch-text">{prefs.repeat ? "Açık" : "Kapalı"}</span>
        </button>
      </div>
      {prefs.repeat && (
        <div className="app-sound-intervals" role="group" aria-label="Tekrar aralığı">
          {REPEAT_INTERVALS.map((seconds) => (
            <button key={seconds} type="button" aria-pressed={prefs.intervalSec === seconds} onClick={() => update({ intervalSec: seconds })}>
              {intervalLabel(seconds)}
            </button>
          ))}
        </div>
      )}
      <p className="app-sound-note">
        Yeni sipariş; “Gördüm” denene, sipariş ilerletilene ya da bir alarm telefonunda onaylanana kadar (en çok 30 dk) tekrar çalar.
      </p>

      {blocked && !silent && (
        <button type="button" className="app-sound-warn" data-audio-unlock="" onClick={() => unlockWithSound({ sound: prefs.sound, volume: prefs.volume })}>
          <VolumeX aria-hidden="true" />Tarayıcı sesi engelledi · açmak için tıklayın
        </button>
      )}

      {permission !== "unsupported" && (
        <div className="app-sound-row">
          <span className="app-sound-label">Masaüstü bildirimi</span>
          {permission === "granted" ? (
            <span className="app-sound-state" data-tone="ok">Açık</span>
          ) : permission === "denied" ? (
            <span className="app-sound-state" title="Tarayıcının site ayarlarından izin verebilirsiniz">Engelli</span>
          ) : (
            <button type="button" className="app-sound-test" onClick={askPermission}>İzin ver</button>
          )}
        </div>
      )}
      <p className="app-sound-note">Bu ayarlar yalnızca bu cihazda geçerlidir. Uzun parçalar her seferinde en çok 15 sn çalar.</p>
    </div>
  );
}
