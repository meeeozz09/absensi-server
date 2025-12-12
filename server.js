import 'dotenv/config';
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRoutes from './routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Terhubung ke MongoDB'))
  .catch(err => console.error('❌ Gagal terhubung ke MongoDB:', err));

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

// Rute Halaman Utama (Dashboard)
app.get('/', async (req, res) => {
    try {
        const Attendance = (await import('./models/Attendance.js')).default;
        const Student = (await import('./models/Student.js')).default;

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(startOfDay);
        endOfDay.setDate(startOfDay.getDate() + 1);

        console.log(`[SERVER] Mencari data absensi antara: ${startOfDay.toISOString()} dan ${endOfDay.toISOString()}`);
        
        const attendancesTodayRaw = await Attendance.find({
            timestamp: { $gte: startOfDay, $lt: endOfDay }
        }).sort({ timestamp: -1 }).populate('student');

        const attendancesToday = attendancesTodayRaw.filter(att => att.student != null);
        
        if (attendancesTodayRaw.length !== attendancesToday.length) {
            console.warn(`[PERINGATAN] Ditemukan ${attendancesTodayRaw.length - attendancesToday.length} data absensi dengan referensi siswa yang rusak/hilang.`);
        }
        
        console.log(`[SERVER] Ditemukan ${attendancesToday.length} data absensi VALID hari ini.`);
        const attendedStudentIds = attendancesToday.map(att => att.student._id);
        
        const absentStudents = await Student.find({ _id: { $nin: attendedStudentIds } }).sort({ name: 1 });

        res.render('index', { 
            title: 'Dashboard Absensi Hari Ini', 
            attendances: attendancesToday,
            absentStudents: absentStudents
        });

    } catch (error) {
        console.error("❌ Gagal mengambil data awal:", error);
        res.render('index', { title: 'Dashboard Absensi', attendances: [], absentStudents: [] });
    }
});

// Rute Halaman Registrasi Manual
app.get('/register', async (req, res) => {
    try {
        const Student = (await import('./models/Student.js')).default;
        const students = await Student.find().sort({ name: 1 });
        res.render('register', { title: 'Registrasi & Kelola Siswa', students: students });
    } catch (error) {
        console.error("Gagal mengambil daftar siswa:", error);
        res.render('register', { title: 'Registrasi & Kelola Siswa', students: [] });
    }
});;

// Rute Halaman Laporan
app.get('/reports', (req, res) => {
    res.render('reports', { title: 'Laporan & Ekspor' });
});

// Gunakan Rute API
app.use('/api', apiRoutes);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
});