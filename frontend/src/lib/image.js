// Cloudinary görsellerine boyut/biçim dönüşümü ekler: tam boyutlu PNG yerine en fazla
// `width` piksel genişlikte, tarayıcıya uygun biçimde (f_auto: WebP/AVIF) ve otomatik kalitede.
// Adreste zaten bir dönüşüm varsa ya da Cloudinary adresi değilse adres olduğu gibi döner.
const UPLOAD_MARKER = "/image/upload/";

export const cloudinaryImage = (url, width = 400) => {
  if (typeof url !== "string" || !url.includes("res.cloudinary.com") || !url.includes(UPLOAD_MARKER)) return url;
  const [base, rest] = url.split(UPLOAD_MARKER);
  if (!rest) return url;
  const firstSegment = rest.split("/")[0];
  // v1234/... sürüm kısmıdır; w_400,... gibi virgüllü/alt çizgili kısım zaten bir dönüşümdür
  if (/^[a-z]{1,3}_[^/]+$/.test(firstSegment)) return url;
  return `${base}${UPLOAD_MARKER}w_${width},c_limit,f_auto,q_auto/${rest}`;
};
