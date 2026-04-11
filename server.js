const express = require("express");
const mysql = require("mysql2");
const session = require("express-session");
const bodyParser = require("body-parser");

require("dotenv").config();

const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));

app.use(session({
    secret: "secret123",
    resave: false,
    saveUninitialized: true
}));

// DB CONNECTION

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
});
db.connect(err => {
    if (err) throw err;
    console.log("✅ DB Connected");
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

db.query(`CREATE TABLE IF NOT EXISTS doctor_availability (
    id INT AUTO_INCREMENT PRIMARY KEY,
    doctor_id INT,
    date DATE,
    time TIME
)`);

// LAYOUT
const layout = (title, content, dash=false) => `
<!DOCTYPE html>
<html>
<head>
<title>${title}</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
<style>
body { background:#f4f6f9; }
.login-box { max-width:400px; margin:80px auto; }
.container { max-width:800px; }
.card { border-radius:10px; }
.navbar { background:#0d6efd; }
.navbar-brand { color:white !important; }
</style>
</head>
<body>

${dash ? `
<nav class="navbar p-3">
<div class="container">
<span class="navbar-brand">Doctor System</span>
<a href="/logout" class="btn btn-light btn-sm">Logout</a>
</div>
</nav>
<div class="container mt-4">${content}</div>
` : `
<div class="login-box">
<div class="card shadow p-4">${content}</div>
</div>
`}

</body>
</html>
`;

// LOGIN PAGE
app.get("/", (req, res) => {
    res.send(layout("Login", `
        <h4 class="text-center">Login</h4>
        <form method="POST" action="/login">
            <input class="form-control mb-2" name="email" placeholder="Email" required>
            <input class="form-control mb-2" type="password" name="password" placeholder="Password" required>
            <button class="btn btn-primary w-100">Login</button>
        </form>
        <p class="text-center mt-2"><a href="/register">Register</a></p>
    `));
});

// REGISTER PAGE
app.get("/register", (req, res) => {
    res.send(layout("Register", `
        <h4>Create Account</h4>
        <form method="POST" action="/register">
            <input class="form-control mb-2" name="name" placeholder="Name" required>
            <input class="form-control mb-2" name="email" placeholder="Email" required>
            <input class="form-control mb-2" type="password" name="password" placeholder="Password" required>
            <button class="btn btn-success w-100">Register</button>
        </form>
        <a href="/">Back to Login</a>
    `));
});

// REGISTER
app.post("/register", (req, res) => {
    const { name, email, password } = req.body;
    db.query("INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)",
        [name, email, password, "patient"],
        () => res.redirect("/")
    );
});

// LOGIN
app.post("/login", (req, res) => {
    const { email, password } = req.body;
    db.query("SELECT * FROM users WHERE email=? AND password=?",
        [email, password],
        (err, result) => {
            if (result.length > 0) {
                req.session.user = result[0];
                res.redirect("/dashboard");
            } else {
                res.send("Invalid Login");
            }
        }
    );
});

// API FOR REALTIME
app.get("/api/appointments", (req, res) => {
    const user = req.session.user;
    if (!user) return res.json([]);

    db.query(`SELECT a.*, u.name as doctor FROM appointments a 
              JOIN users u ON a.doctor_id=u.id 
              WHERE patient_id=?`,
        [user.id],
        (err, result) => res.json(result)
    );
});

// DASHBOARD
app.get("/dashboard", (req, res) => {
    if (!req.session.user) return res.redirect("/");
    const user = req.session.user;

    // PATIENT
    if (user.role === "patient") {
        db.query("SELECT * FROM users WHERE role='doctor'", (err, docs) => {

            let html = `
            <h4>Welcome ${user.name}</h4>

            <div class="card p-3 mb-3">
            <form method="GET">
                <select name="doc" class="form-control mb-2" required>
                    <option value="">Select Doctor</option>
                    ${docs.map(d => `<option value="${d.id}">Dr. ${d.name}</option>`).join("")}
                </select>
                <input type="date" name="date" class="form-control mb-2" required>
                <button class="btn btn-primary w-100">Check Slots</button>
            </form>
            </div>
            `;

            const { doc, date } = req.query;

            if (doc && date) {
                db.query("SELECT * FROM doctor_availability WHERE doctor_id=? AND date=?",
                    [doc, date],
                    (err, slots) => {

                        html += "<h5>Available Slots</h5>";

                        slots.forEach(s => {
                            html += `
                            <form method="POST" action="/book">
                                <input type="hidden" name="doctor" value="${doc}">
                                <input type="hidden" name="date" value="${date}">
                                <input type="hidden" name="time" value="${s.time}">
                                <button class="btn btn-outline-success m-1">${s.time}</button>
                            </form>`;
                        });

                        // REALTIME UI
                        html += `
                        <h5 class="mt-3">Your Appointments</h5>
                        <div id="appointments"></div>

                        <audio id="sound" src="/notify.mp3"></audio>

                        <script>
                        let oldData = [];

                        function loadData() {
                            fetch('/api/appointments')
                            .then(r=>r.json())
                            .then(data=>{
                                let h="";

                                data.forEach(a=>{
                                    let badge="secondary";
                                    if(a.status=="approved") badge="success";
                                    else if(a.status=="rejected") badge="danger";
                                    else badge="warning";

                                    h+=\`
                                    <div class="card p-2 mb-2">
                                        \${a.doctor} | \${a.date} \${a.time}
                                        <span class="badge bg-\${badge}">\${a.status}</span>
                                    </div>\`;
                                });

                                document.getElementById("appointments").innerHTML=h;

                                if(oldData.length){
                                    data.forEach((a,i)=>{
                                        if(oldData[i] && oldData[i].status!=a.status){
                                            document.getElementById("sound").play();
                                            alert("Status Updated: "+a.status);
                                        }
                                    });
                                }

                                oldData=data;
                            });
                        }

                        setInterval(loadData,5000);
                        loadData();
                        </script>
                        `;

                        res.send(layout("Dashboard", html, true));
                    });
            } else {
                res.send(layout("Dashboard", html, true));
            }
        });
    }

    // DOCTOR
    else {
        db.query(`SELECT a.*, u.name as patient FROM appointments a 
                  JOIN users u ON a.patient_id=u.id 
                  WHERE doctor_id=?`,
            [user.id],
            (err, apps) => {

                let html = `<h4>Welcome Dr. ${user.name}</h4>`;

                apps.forEach(a => {
                    html += `<div class="card p-2 mb-2">
                        ${a.patient} | ${a.date} ${a.time} | ${a.status}
                        <br>
                        <a href="/approve/${a.id}" class="btn btn-success btn-sm">Approve</a>
                        <a href="/reject/${a.id}" class="btn btn-danger btn-sm">Reject</a>
                    </div>`;
                });

                res.send(layout("Doctor", html, true));
            });
    }
});

// BOOK
app.post("/book", (req, res) => {
    const user = req.session.user;
    const { doctor, date, time } = req.body;

    db.query("SELECT * FROM appointments WHERE doctor_id=? AND date=? AND time=?",
        [doctor, date, time],
        (err, result) => {

            if (result.length > 0) {
                return res.send("Slot already booked");
            }

            db.query("INSERT INTO appointments(patient_id,doctor_id,date,time,status) VALUES(?,?,?,?,?)",
                [user.id, doctor, date, time, "pending"],
                () => res.redirect("/dashboard")
            );
        });
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

app.listen(process.env.PORT || 3000, () => {
    console.log("🚀 Server running");
});