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
  ws.send(JSON.stringify({ type: 'welcome', message: 'Terhubung ke server absensi!' }));
});

function broadcast(data) {
    console.log('Broadcasting data:', data);
    wss.clients.forEach((client) => {
        if (client.readyState === 1 /* WebSocket.OPEN */) {
            client.send(JSON.stringify(data));
        }
    });
}
app.set('broadcast', broadcast);

app.get('/', async (req, res) => {
    try {
        const Attendance = (await import('./models/Attendance.js')).default;
        
        const today = new Date();
        today.setHours(0, 0, 0, 0); 
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const attendancesToday = await Attendance.find({
            timestamp: { $gte: today, $lt: tomorrow }
        }).sort({ timestamp: -1 }).populate('student'); 

        res.render('index', { 
            title: 'Dashboard Absensi Hari Ini', 
            attendances: attendancesToday 
        });
    } catch (error) {
        console.error("Gagal mengambil data absensi awal:", error);
        res.render('index', { title: 'Dashboard Absensi', attendances: [] });
    }
});

app.get('/register', (req, res) => {
    res.render('register', { title: 'Registrasi Siswa' });
});

app.use('/api', apiRoutes); 

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
});