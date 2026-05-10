// server.js - VERSI FINAL DENGAN PENANGANAN PARAMETER TANGGAL

import 'dotenv/config';
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser'; 
import apiRoutes from './routes/api.js';
import authRoutes from './routes/auth.js'; 
import { protect } from './middleware/authMiddleware.js';

// Setup dasar
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser()); 
app.use(express.static(path.join(__dirname, 'public')));

// --- Koneksi Database ---
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Terhubung ke MongoDB'))
  .catch(err => console.error('❌ Gagal terhubung ke MongoDB:', err));

// --- WebSocket ---
wss.on('connection', (ws) => {
  console.log('🔌 Klien terhubung ke WebSocket');
  ws.on('close', () => console.log('🔌 Klien terputus dari WebSocket'));
});
function broadcast(data) {
    console.log('Broadcasting data:', data);
    wss.clients.forEach((client) => {
        if (client.readyState === 1) { client.send(JSON.stringify(data)); }
    });
}
app.set('broadcast', broadcast);

// ==========================================================
// ==                  DEFINISI RUTE (ROUTES)                ==
// ==========================================================

// --- 1. RUTE PUBLIK ---
app.get('/login', (req, res) => {
    if (req.cookies.token) {
        return res.redirect('/');
    }
    res.render('login', { title: 'Login Sistem Absensi' });
});

// --- 2. RUTE API ---
app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);

// --- 3. RUTE YANG DILINDUNGI ---

// Rute Halaman Utama (Dashboard) - DENGAN PERBAIKAN
app.get('/', protect, (req, res) => {
    // Ambil tanggal dari query URL (?date=YYYY-MM-DD)
    const dateQuery = req.query.date;
    
    // Jika ada tanggal di query, gunakan itu. Jika tidak, gunakan string kosong.
    // JavaScript di frontend akan menanganinya jika kosong (default ke hari ini).
    const currentDate = dateQuery || ""; 

    res.render('index', { 
        title: 'Dashboard Absensi',
        user: req.user,
        // Kirim tanggal yang dipilih (atau string kosong) ke EJS
        currentDate: currentDate 
    });
});

// Rute Halaman Registrasi Siswa
app.get('/register', protect, async (req, res) => {
    try {
        const Student = (await import('./models/Student.js')).default;
        const students = await Student.find().sort({ name: 1 });
        res.render('register', { title: 'Registrasi & Kelola Siswa', students: students, user: req.user });
    } catch (error) {
        console.error("Gagal mengambil daftar siswa:", error);
        res.render('register', { title: 'Registrasi & Kelola Siswa', students: [], user: req.user });
    }
});

// Rute Halaman Laporan
app.get('/reports', protect, (req, res) => {
    res.render('reports', { title: 'Laporan & Ekspor', user: req.user });
});


// --- Menjalankan Server ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
});