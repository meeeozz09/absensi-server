import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Student from '../models/Student.js';
import Attendance from '../models/Attendance.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let isRegistrationMode = false;

router.post('/attendance/tap', async (req, res) => {
    const { uid, image_data } = req.body;
    const broadcast = req.app.get('broadcast'); 

    if (!uid) {
        return res.status(400).json({ message: 'UID is required' });
    }

    if (isRegistrationMode) {
        const studentExists = await Student.findOne({ uid });
        if (!studentExists) {
            console.log(`[REG MODE] Prompting registration for new UID: ${uid}`);
            broadcast({ type: 'registration_prompt', uid });
            return res.status(200).json({ message: 'Registration prompt sent' });
        }
    }

    try {
        const student = await Student.findOne({ uid });
        if (!student) {
            console.log(`[ATTENDANCE] Tap from unknown UID: ${uid}`);
            return res.status(404).json({ message: 'Siswa tidak terdaftar' });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0); 
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1); 

        const existingAttendance = await Attendance.findOne({
            student: student._id,
            timestamp: { $gte: today, $lt: tomorrow }
        });

        if (existingAttendance) {
            console.log(`[ATTENDANCE] Siswa ${student.name} sudah absen hari ini dengan status ${existingAttendance.status}.`);
            return res.status(409).json({ message: `Sudah absen: ${existingAttendance.status}` });
        }

        let photoUrl = null;
        if (image_data) {
            try {
                const base64Data = image_data.replace(/^data:image\/jpeg;base64,/, "");
                const fileName = `${Date.now()}-${uid}.jpg`;
                const photoDir = path.join(__dirname, '..', 'public', 'photos');
                
                if (!fs.existsSync(photoDir)){
                    fs.mkdirSync(photoDir, { recursive: true });
                }
                
                const photoPath = path.join(photoDir, fileName);
                fs.writeFileSync(photoPath, base64Data, 'base64');
                photoUrl = `/photos/${fileName}`;
                console.log(`[PHOTO] Foto berhasil disimpan di: ${photoUrl}`);
            } catch (photoError) {
                console.error('❌ Gagal menyimpan foto:', photoError);
            }
        }

        const newAttendance = new Attendance({ 
            student: student._id,
            timestamp: new Date(),
            status: 'HADIR',
            photoUrl 
        });
        await newAttendance.save();
        
        const populatedAttendance = await Attendance.findById(newAttendance._id).populate('student');
        
        broadcast({ type: 'new_attendance', data: populatedAttendance });
        
        console.log(`[ATTENDANCE] Absensi 'HADIR' tercatat untuk: ${student.name}`);
        res.status(200).json({ message: `Hadir, ${student.name}` });

    } catch (error) {
        console.error('Error saat proses absensi:', error);
        res.status(500).json({ message: 'Server error' });
    }
});


router.post('/registration-mode', (req, res) => {
    const { enabled } = req.body;
    isRegistrationMode = enabled;
    const broadcast = req.app.get('broadcast');
    broadcast({ type: 'mode_status', isRegistrationMode });
    console.log(`[REG MODE] Mode registrasi diubah menjadi: ${isRegistrationMode ? 'ON' : 'OFF'}`);
    res.status(200).json({ message: `Mode registrasi ${enabled ? 'diaktifkan' : 'dinonaktifkan'}` });
});


router.post('/students', async (req, res) => {
    try {
        const { uid, name, studentId } = req.body;

        if (!uid || !name || !studentId) {
            return res.status(400).json({ success: false, message: "Semua field (UID, Nama, ID Siswa) harus diisi." });
        }
        const newStudent = await Student.create({ uid, name, studentId });

        res.status(201).json({ success: true, data: newStudent });
        console.log(`[REGISTRATION] Siswa baru berhasil didaftarkan: ${name}`);

    } catch (error) {
        console.error('❌ Gagal mendaftarkan siswa:', error);

        if (error.code === 11000) {
            return res.status(409).json({ success: false, message: "UID atau ID Siswa sudah terdaftar." });
        }
        res.status(500).json({ success: false, message: "Terjadi kesalahan di server saat mendaftar." });
    }
});

router.post('/attendance/manual', async (req, res) => {
    const { studentId, date, status, keterangan } = req.body;
    const broadcast = req.app.get('broadcast');

    try {
        const student = await Student.findById(studentId);
        if (!student) {
            return res.status(404).json({ message: "Siswa tidak ditemukan." });
        }

        const attendanceDate = new Date(date);
        attendanceDate.setUTCHours(0, 0, 0, 0);
        const nextDay = new Date(attendanceDate);
        nextDay.setDate(nextDay.getDate() + 1);

        const updatedAttendance = await Attendance.findOneAndUpdate(
            { student: student._id, timestamp: { $gte: attendanceDate, $lt: nextDay } },
            { 
                student: student._id,
                timestamp: attendanceDate,
                status: status, 
                keterangan: keterangan || '',
                $unset: { photoUrl: "" } 
            },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        ).populate('student');

        broadcast({ type: 'update_attendance', data: updatedAttendance });
        
        console.log(`[MANUAL] Absensi manual (${status}) untuk ${student.name} pada tanggal ${date}`);
        res.status(200).json({ success: true, data: updatedAttendance });

    } catch (error) {
        console.error('Gagal input absensi manual:', error);
        res.status(500).json({ success: false, message: 'Server error saat input manual' });
    }
});

export default router;