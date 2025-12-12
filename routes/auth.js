import express from 'express';
import User from '../models/User.js';
import jwt from 'jsonwebtoken';

const router = express.Router();
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '1d', // Token berlaku selama 1 hari
  });
};

// --- ENDPOINT UNTUK LOGIN ---
// URL: POST /api/auth/login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    console.log(`\n[DEBUG] Menerima permintaan login untuk username: '${username}'`);

    try {
        if (!username || !password) {
            console.log("[DEBUG] Gagal: Username atau password kosong.");
            return res.status(400).json({ message: 'Username dan password harus diisi.' });
        }

        // Cari user di database dengan username yang sudah di-lowercase
        const user = await User.findOne({ username: username.toLowerCase() });

        // === Cek #1: Apakah user ditemukan? ===
        if (!user) {
            console.log(`[DEBUG] Gagal: User dengan username '${username.toLowerCase()}' tidak ditemukan di database.`);
            return res.status(401).json({ message: 'Username atau password salah.' });
        }

        console.log(`[DEBUG] Sukses: User '${user.username}' ditemukan di database.`);
        console.log(`[DEBUG] Hash password dari DB: ${user.password}`);

        // === Cek #2: Apakah password cocok? ===
        const isMatch = await user.matchPassword(password);

        if (isMatch) {
            console.log("[DEBUG] Sukses: Password cocok!");
            // ... (logika generate token dan kirim cookie tetap sama) ...
            const token = generateToken(user._id);
            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 24 * 60 * 60 * 1000
            });
            res.status(200).json({ _id: user._id, username: user.username, role: user.role });
        } else {
            console.log("[DEBUG] Gagal: Password TIDAK cocok.");
            return res.status(401).json({ message: 'Username atau password salah.' });
        }
    } catch (error) {
        console.error("❌ Login error:", error);
        res.status(500).json({ message: 'Server error saat login.' });
    }
});


// --- ENDPOINT UNTUK REGISTRASI USER (ADMIN/GURU) ---
// URL: POST /api/auth/register (Bisa dipanggil dari halaman admin khusus)
router.post('/register', async (req, res) => {
    const { username, password, role } = req.body;
    try {
        const userExists = await User.findOne({ username });
        if (userExists) {
            return res.status(400).json({ message: 'Username sudah digunakan.' });
        }
        const user = await User.create({ username, password, role });
        res.status(201).json({ message: 'User berhasil dibuat.', userId: user._id });
    } catch (error) {
        res.status(500).json({ message: 'Gagal membuat user.', error: error.message });
    }
});


// --- ENDPOINT UNTUK LOGOUT ---
// URL: POST /api/auth/logout
router.post('/logout', (req, res) => {
    res.cookie('token', '', {
        httpOnly: true,
        expires: new Date(0)
    });
    res.status(200).json({ message: 'Logout berhasil.' });
});

export default router;