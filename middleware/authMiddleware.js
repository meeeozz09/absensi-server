import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const protect = async (req, res, next) => {
    let token;

    if (req.cookies.token) {
        try {
            token = req.cookies.token;
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
            req.user = await User.findById(decoded.id).select('-password');
            next(); 
        } catch (error) {
            console.error(error);
            res.status(401).redirect('/login?message=Sesi tidak valid, silakan login kembali.');
        }
    }

    if (!token) {
        res.status(401).redirect('/login?message=Tidak terautentikasi, silakan login.');
    }
};

export { protect };