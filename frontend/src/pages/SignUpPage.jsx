import { useState } from "react";
import { Link } from "react-router-dom";
import { UserPlus, Mail, Lock, User, ArrowRight, Loader, Phone } from "lucide-react";
import { motion } from "framer-motion";
import { useUserStore } from "../stores/useUserStore";

const SignUpPage = () => {
	const [formData, setFormData] = useState({
		name: "",
		email: "",
		password: "",
		confirmPassword: "",
		phone: "",
	});

	const { signup, loading } = useUserStore();

	const handleSubmit = (e) => {
		e.preventDefault();
		signup(formData);
	};

	return (
		<div className='min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gray-900'>
			<div className='max-w-md w-full space-y-8'>
				<motion.div
					initial={{ opacity: 0, y: -20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.8 }}
				>
					<Link to="/" className="flex justify-center mb-8">
						<img src="/logo.png" alt="Logo" className="w-16 h-16" />
					</Link>
					<h2 className='text-center text-3xl font-extrabold text-emerald-400'>Hesabını Oluştur</h2>
					<p className="mt-2 text-center text-sm text-gray-400">
						Hemen üye ol, alışverişin keyfini çıkar!
					</p>
				</motion.div>

				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.8, delay: 0.2 }}
					className="bg-gray-800/50 backdrop-blur-xl p-8 rounded-xl shadow-xl border border-gray-700/50"
				>
					<form onSubmit={handleSubmit} className='space-y-6'>
						<div>
							<label htmlFor='name' className='block text-sm font-medium text-gray-300'>
								İsim Soyisim
							</label>
							<div className='mt-1 relative rounded-md shadow-sm'>
								<div className='absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none'>
									<User className='h-5 w-5 text-gray-400' aria-hidden='true' />
								</div>
								<input
									id='name'
									type='text'
									required
									value={formData.name}
									onChange={(e) => setFormData({ ...formData, name: e.target.value })}
									className='block w-full px-3 py-2 pl-10 bg-gray-700/50 border border-gray-600 rounded-md shadow-sm
									 placeholder-gray-400 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm'
									placeholder='İsim Soyisim'
								/>
							</div>
						</div>

						<div>
							<label htmlFor='phone' className='block text-sm font-medium text-gray-300'>
								Telefon Numarası
							</label>
							<div className='mt-1 relative rounded-md shadow-sm'>
								<div className='absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none'>
									<Phone className='h-5 w-5 text-gray-400' aria-hidden='true' />
								</div>
								<input
									id='phone'
									type='tel'
									required
									value={formData.phone}
									onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
									className='block w-full px-3 py-2 pl-10 bg-gray-700/50 border border-gray-600 rounded-md shadow-sm
									 placeholder-gray-400 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm'
									placeholder='05XX XXX XX XX'
								/>
							</div>
						</div>

						<div>
							<label htmlFor='email' className='block text-sm font-medium text-gray-300'>
								E-Mail
							</label>
							<div className='mt-1 relative rounded-md shadow-sm'>
								<div className='absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none'>
									<Mail className='h-5 w-5 text-gray-400' aria-hidden='true' />
								</div>
								<input
									id='email'
									type='email'
									required
									value={formData.email}
									onChange={(e) => setFormData({ ...formData, email: e.target.value })}
									className='block w-full px-3 py-2 pl-10 bg-gray-700/50 border border-gray-600 rounded-md shadow-sm
									 placeholder-gray-400 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm'
									placeholder='benimmarketim@example.com'
								/>
							</div>
						</div>

						<div>
							<label htmlFor='password' className='block text-sm font-medium text-gray-300'>
								Şifre
							</label>
							<div className='mt-1 relative rounded-md shadow-sm'>
								<div className='absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none'>
									<Lock className='h-5 w-5 text-gray-400' aria-hidden='true' />
								</div>
								<input
									id='password'
									type='password'
									required
									value={formData.password}
									onChange={(e) => setFormData({ ...formData, password: e.target.value })}
									className='block w-full px-3 py-2 pl-10 bg-gray-700/50 border border-gray-600 rounded-md shadow-sm
									 placeholder-gray-400 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm'
									placeholder='••••••••'
								/>
							</div>
						</div>

						<div>
							<label htmlFor='confirmPassword' className='block text-sm font-medium text-gray-300'>
								Şifre Onay
							</label>
							<div className='mt-1 relative rounded-md shadow-sm'>
								<div className='absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none'>
									<Lock className='h-5 w-5 text-gray-400' aria-hidden='true' />
								</div>
								<input
									id='confirmPassword'
									type='password'
									required
									value={formData.confirmPassword}
									onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
									className='block w-full px-3 py-2 pl-10 bg-gray-700/50 border border-gray-600 rounded-md shadow-sm
									 placeholder-gray-400 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm'
									placeholder='••••••••'
								/>
							</div>
						</div>

						<button
							type='submit'
							className='w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium 
							text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 
							transition duration-150 ease-in-out disabled:opacity-50'
							disabled={loading}
						>
							{loading ? (
								<>
									<Loader className='mr-2 h-5 w-5 animate-spin' aria-hidden='true' />
									Yükleniyor...
								</>
							) : (
								<>
									<UserPlus className='mr-2 h-5 w-5' aria-hidden='true' />
									Kayıt Ol
								</>
							)}
						</button>
					</form>

					<p className='mt-6 text-center text-sm text-gray-400'>
						Zaten bir hesabınız var mı?{" "}
						<Link to='/login' className='font-medium text-emerald-400 hover:text-emerald-300 transition-colors duration-200'>
							Buradan giriş yapın <ArrowRight className='inline h-4 w-4' />
						</Link>
					</p>
				</motion.div>
			</div>
		</div>
	);
};

export default SignUpPage;
