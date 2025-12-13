import { v2 as cloudinary } from 'cloudinary';
import 'dotenv/config'; 

cloudinary.config({ 
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
    api_key: process.env.CLOUDINARY_API_KEY, 
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true 
});


const uploadImage = async (base64Image, publicId) => {
    try {
        const result = await cloudinary.uploader.upload(
            `data:image/jpeg;base64,${base64Image}`, 
            {
                public_id: publicId,
                folder: 'absensi-siswa' 
            }
        );
        return result.secure_url; 
    } catch (error) {
        console.error("Cloudinary upload error:", error);
        return null;
    }
};

export { uploadImage };