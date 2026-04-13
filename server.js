const express = require("express");
const mysql = require("mysql2");
const session = require("express-session");
const bodyParser = require("body-parser");

const app = express();

app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
    secret: "secret123",
    resave: false,
    saveUninitialized: true
}));

// ================= DB =================
const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "root123",
    database: "doctor_system"
});

db.connect(err => {
    if (err) console.log("DB Error:", err.message);
    else console.log("✅ DB Connected");
});

// TABLES
db.query(`CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(100),
    password VARCHAR(100),
    role VARCHAR(20)
)`);

db.query(`CREATE TABLE IF NOT EXISTS appointments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT,
    doctor_id INT,
    date DATE,
    time TIME,
    status VARCHAR(20)
)`);

// ================= UI TEMPLATE =================
const layout = (title, content) => `
<!DOCTYPE html>
<html>
<head>
<title>${title}</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">

<style>
body {
    background: linear-gradient(135deg, #4e73df, #1cc88a);
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
}
.card { border-radius: 15px; }
.form-control { height: 45px; }
.btn { height: 45px; font-weight: bold; }
.title { text-align:center; font-weight:bold; margin-bottom:20px; }
</style>
</head>

<body>
<div class="container">
<div class="row justify-content-center">
<div class="col-md-5">
<div class="card shadow p-4">
${content}
</div>
</div>
</div>
</div>
</body>
</html>
`;

// ================= LOGIN =================
app.get("/", (req, res) => {
    res.send(layout("Login", `
        <h3 class="title">Doctor System</h3>

        <form method="POST" action="/login">
            <input class="form-control mb-3" name="email" placeholder="Email" required>
            <input class="form-control mb-3" type="password" name="password" placeholder="Password" required>
            <button class="btn btn-primary w-100">Login</button>
        </form>

        <p class="text-center mt-3">
            New user? <a href="/register">Register</a>
        </p>
    `));
});

// ================= REGISTER PAGE =================
app.get("/register", (req, res) => {
    res.send(layout("Register", `
        <h3 class="title">Create Account</h3>

        <form method="POST" action="/register">
            <input class="form-control mb-3" name="name" placeholder="Full Name" required>
            <input class="form-control mb-3" name="email" placeholder="Email" required>
            <input class="form-control mb-3" type="password" name="password" placeholder="Password" required>
            <button class="btn btn-success w-100">Register</button>
        </form>

        <p class="text-center mt-3">
            Already have account? <a href="/">Login</a>
        </p>
    `));
});

// ================= REGISTER LOGIC =================
app.post("/register", (req, res) => {
    const { name, email, password } = req.body;

    // CHECK EMAIL EXISTS
    db.query("SELECT * FROM users WHERE email=?", [email], (err, result) => {

        if (result.length > 0) {
            return res.send(layout("Error", `
                <h4 class="text-danger text-center">❌ Email already exists</h4>
                <a href="/register" class="btn btn-danger w-100 mt-3">Try Again</a>
            `));
        }

        db.query(
            "INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)",
            [name, email, password, "patient"],
            (err) => {
                if (err) {
                    return res.send(layout("Error", `
                        <h4 class="text-danger text-center">❌ Registration Failed</h4>
                        <a href="/register" class="btn btn-danger w-100 mt-3">Back</a>
                    `));
                }

                // SUCCESS MESSAGE + AUTO REDIRECT
                res.send(layout("Success", `
                    <div class="text-center">
                        <h3 class="text-success">✅ Registration Successful</h3>
                        <p>Redirecting to login...</p>
                    </div>

                    <script>
                        setTimeout(() => {
                            window.location.href = "/";
                        }, 3000);
                    </script>
                `));
            }
        );
    });
});

// ================= LOGIN LOGIC =================
app.post("/login", (req, res) => {
    const { email, password } = req.body;

    db.query(
        "SELECT * FROM users WHERE email=? AND password=?",
        [email, password],
        (err, result) => {
            if (result.length > 0) {
                req.session.user = result[0];
                res.redirect("/dashboard");
            } else {
                res.send(layout("Error", `
                    <h4 class="text-danger text-center">❌ Invalid Login</h4>
                    <a href="/" class="btn btn-primary w-100 mt-3">Try Again</a>
                `));
            }
        }
    );
});

// ================= DASHBOARD =================
app.get("/dashboard", (req, res) => {
    if (!req.session.user) return res.redirect("/");

    const user = req.session.user;

    // PATIENT
    if (user.role === "patient") {
        db.query("SELECT * FROM users WHERE role='doctor'", (err, docs) => {

            db.query(
                `SELECT a.*, u.name as doctor FROM appointments a 
                 JOIN users u ON a.doctor_id=u.id 
                 WHERE patient_id=?`,
                [user.id],
                (err, apps) => {

                    res.send(layout("Dashboard", `
                        <h4>Welcome ${user.name}</h4>

                        <h5>Book Appointment</h5>
                        <form method="POST" action="/book">
                            <select class="form-control mb-2" name="doctor" multiple size="5">
                                ${docs.map(d => `<option value="${d.id}">Dr. ${d.name}</option>`).join("")}
                            </select>

                            <input class="form-control mb-2" type="date" name="date" required>
                            <input class="form-control mb-2" type="time" name="time" required>

                            <button class="btn btn-success">Book</button>
                        </form>

                        <h5 class="mt-4">Your Appointments</h5>

                        ${apps.length === 0 ? "No appointments" :
                            apps.map(a => `
                                <div class="border p-2 mb-2">
                                    ${a.doctor} | ${a.date} ${a.time} | <b>${a.status}</b>
                                </div>
                            `).join("")
                        }

                        <a href="/logout" class="btn btn-danger mt-3">Logout</a>
                    `));
                }
            );
        });
    }

    // DOCTOR
    else {
        db.query(
            `SELECT a.*, u.name as patient FROM appointments a 
             JOIN users u ON a.patient_id=u.id 
             WHERE doctor_id=?`,
            [user.id],
            (err, apps) => {

                res.send(layout("Doctor", `
                    <h4>Welcome Dr. ${user.name}</h4>

                    ${apps.length === 0 ? "No appointments" :
                        apps.map(a => `
                            <div class="border p-2 mb-2">
                                ${a.patient} | ${a.date} ${a.time} | <b>${a.status}</b>
                                <br>
                                <a href="/approve/${a.id}" class="btn btn-success btn-sm">Approve</a>
                                <a href="/reject/${a.id}" class="btn btn-danger btn-sm">Reject</a>
                            </div>
                        `).join("")
                    }

                    <a href="/logout" class="btn btn-danger mt-3">Logout</a>
                `));
            }
        );
    }
});

// ================= BOOK =================
app.post("/book", (req, res) => {
    const user = req.session.user;
    const { doctor, date, time } = req.body;

    const doctors = Array.isArray(doctor) ? doctor : [doctor];

    doctors.forEach(doc => {
        db.query(
            "INSERT INTO appointments(patient_id,doctor_id,date,time,status) VALUES(?,?,?,?,?)",
            [user.id, doc, date, time, "pending"]
        );
    });

    res.redirect("/dashboard");
});

// APPROVE / REJECT
app.get("/approve/:id", (req, res) => {
    db.query("UPDATE appointments SET status='approved' WHERE id=?", [req.params.id]);
    res.redirect("/dashboard");
});

app.get("/reject/:id", (req, res) => {
    db.query("UPDATE appointments SET status='rejected' WHERE id=?", [req.params.id]);
    res.redirect("/dashboard");
});

// LOGOUT
app.get("/logout", (req, res) => {
    req.session.destroy();
    res.redirect("/");
});

// START
app.listen(3000, () => {
    console.log("🚀 http://localhost:3000");
});