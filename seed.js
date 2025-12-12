import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/User.js'; 

dotenv.config();

const usersToSeed = [
    { username: 'admin', password: 'admin123', role: 'admin' },
    { username: 'gurusekolah', password: 'gurukelas6', role: 'guru' }
];

const seedUsers = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Terhubung ke MongoDB untuk proses seeding...');

        await User.deleteMany({
            username: { $in: usersToSeed.map(u => u.username) }
        });
        console.log('🗑️ User lama (jika ada) berhasil dihapus.');

        for (const userData of usersToSeed) {
            await User.create(userData);
            console.log(`   - User '${userData.username}' berhasil dibuat dan password di-hash.`);
        }
        
        console.log('🌱 Semua data user baru berhasil ditambahkan.');
        
    } catch (error) {
        console.error('❌ Terjadi error saat seeding data:', error);
    } finally {
        await mongoose.connection.close();
        console.log('🔌 Koneksi MongoDB ditutup.');
        process.exit();
    }
};

seedUsers();