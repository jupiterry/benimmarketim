import { Link } from "react-router-dom";

const CategoryItem = ({ category }) => {
	return (
		<div className='relative overflow-hidden h-72 w-full rounded-lg group'>
			<Link to={"/category" + category.href}>
				<div className='w-full h-full cursor-pointer relative'>
					<div className='absolute inset-0 bg-gradient-to-b from-transparent to-gray-900 opacity-60 z-10' />
					<div className='absolute inset-0 flex items-center justify-center p-4'>
						<img
							src={category.imageUrl}
							alt={category.name}
							className='w-full h-full object-contain transition-transform duration-500 ease-out group-hover:scale-110'
							loading='lazy'
						/>
					</div>
					<div className='absolute bottom-0 left-0 right-0 p-4 z-20'>
						<h3 className='text-white text-xl font-bold mb-2'>
							{category.displayName || category.name}
						</h3>
						<p className='text-gray-200 text-sm'>
							Daha fazla {category.displayName || category.name} ürünü için tıkla!
						</p>
					</div>
				</div>
			</Link>
		</div>
	);
};

export default CategoryItem;
