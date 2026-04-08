#TTTTTTemp1
Temp1emp1emp1emp1emp1emp1"


backend/server.js
JavaScript
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const XLSX = require("xlsx");
const pool = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer();

const getIP = (req) =>
  req.headers["x-forwarded-for"] || req.socket.remoteAddress;

// ================= EXCEL UPLOAD =================
app.post("/api/upload", upload.single("file"), async (req, res) => {
  const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet);

  for (const row of data) {
    const { sw_model, chip_name, form_factor, description } = row;

    await pool.query(
      `INSERT INTO hardware_summary 
       (sw_model, chip_name, form_factor, description)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE sw_model=sw_model`,
      [sw_model, chip_name, form_factor, description]
    );

    const teams = [
      "Product PL","Memory","Performance",
      "Release Management","Robustness","Test Farm/Soc"
    ];

    for (const t of teams) {
      await pool.query(
        `INSERT IGNORE INTO team_panel_data (sw_model, team_name)
         VALUES (?, ?)`,
        [sw_model, t]
      );
    }
  }

  res.send("Uploaded");
});

// ================= DASHBOARD =================
app.get("/api/hardware", async (req, res) => {
  const [rows] = await pool.query(`
    SELECT h.*, 
    COALESCE(SUM(t.atsc + t.dvb + t.isdb + t.aot),0) as existing_panels
    FROM hardware_summary h
    LEFT JOIN team_panel_data t ON h.sw_model = t.sw_model
    GROUP BY h.sw_model
  `);

  res.json(rows);
});

// ================= LOCK =================
app.post("/api/lock/:chip", async (req, res) => {
  const chip = req.params.chip;
  const ip = getIP(req);

  const [lock] = await pool.query(
    "SELECT * FROM chip_lock WHERE chip_name=?",
    [chip]
  );

  if (lock.length)
    return res.status(400).json({ by: lock[0].locked_by });

  await pool.query(
    "INSERT INTO chip_lock (chip_name, locked_by) VALUES (?,?)",
    [chip, ip]
  );

  res.send("locked");
});

// ================= GET CHIP =================
app.get("/api/chip/:chip", async (req, res) => {
  const chip = req.params.chip;

  const [summary] = await pool.query(
    "SELECT * FROM hardware_summary WHERE chip_name=?",
    [chip]
  );

  const [teams] = await pool.query(
    `SELECT * FROM team_panel_data WHERE sw_model IN 
     (SELECT sw_model FROM hardware_summary WHERE chip_name=?)`,
    [chip]
  );

  res.json({ summary, teams });
});

// ================= SAVE =================
app.post("/api/save/:chip", async (req, res) => {
  const chip = req.params.chip;
  const ip = getIP(req);
  const { data } = req.body;

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [lock] = await conn.query(
      "SELECT * FROM chip_lock WHERE chip_name=?",
      [chip]
    );

    if (!lock.length || lock[0].locked_by !== ip)
      throw new Error("Lock lost");

    for (const row of data) {
      await conn.query(
        "UPDATE hardware_summary SET required_panels=? WHERE sw_model=?",
        [row.required_panels, row.sw_model]
      );

      for (const t of row.teams) {
        await conn.query(
          `UPDATE team_panel_data 
           SET atsc=?, dvb=?, isdb=?, aot=?, remarks=? 
           WHERE id=?`,
          [t.atsc, t.dvb, t.isdb, t.aot, t.remarks, t.id]
        );
      }
    }

    await conn.query("DELETE FROM chip_lock WHERE chip_name=?", [chip]);

    await conn.commit();
    res.send("Saved");
  } catch (e) {
    await conn.rollback();
    res.status(400).send(e.message);
  } finally {
    conn.release();
  }
});

app.listen(5000, () => console.log("Backend running"));
🎨 4. FRONTEND SETUP
📦 frontend/package.json
JSON
{
  "name": "frontend",
  "dependencies": {
    "@mui/material": "^5.15.0",
    "@mui/icons-material": "^5.15.0",
    "axios": "^1.6.0",
    "react-router-dom": "^6.0.0"
  }
}
🔌 api.js
JavaScript
import axios from "axios";

export default axios.create({
  baseURL: "http://localhost:5000/api"
});
🧠 App.js
JavaScript
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./components/Dashboard";
import EditPage from "./components/EditPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/edit/:chip" element={<EditPage />} />
      </Routes>
    </BrowserRouter>
  );
}
📊 Dashboard.js
JavaScript
import { useEffect, useState } from "react";
import api from "../services/api";
import { Table, TableRow, TableCell, Button } from "@mui/material";
import { useNavigate } from "react-router-dom";
import ChipDialog from "./ChipDialog";

export default function Dashboard() {
  const [data, setData] = useState([]);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/hardware").then(res => setData(res.data));
  }, []);

  const handleChip = async (chip) => {
    try {
      await api.post(`/lock/${chip}`);
      navigate(`/edit/${chip}`);
    } catch (e) {
      alert("Locked by " + e.response.data.by);
    }
  };

  return (
    <div>
      <Button onClick={()=>setOpen(true)}>Edit</Button>

      <ChipDialog open={open} onSelect={handleChip} data={data}/>

      <Table>
        {data.map(r => (
          <TableRow key={r.sw_model}>
            <TableCell>{r.sw_model}</TableCell>
            <TableCell>{r.chip_name}</TableCell>
            <TableCell>{r.required_panels}</TableCell>
            <TableCell>{r.existing_panels}</TableCell>
            <TableCell>{r.required_panels - r.existing_panels}</TableCell>
          </TableRow>
        ))}
      </Table>
    </div>
  );
}
🎯 ChipDialog.js
JavaScript
import { Dialog, Select, MenuItem, Button } from "@mui/material";
import { useState } from "react";

export default function ChipDialog({ open, data, onSelect }) {
  const chips = [...new Set(data.map(d=>d.chip_name))];
  const [chip, setChip] = useState("");

  return (
    <Dialog open={open}>
      <Select value={chip} onChange={(e)=>setChip(e.target.value)}>
        {chips.map(c => <MenuItem key={c}>{c}</MenuItem>)}
      </Select>
      <Button onClick={()=>onSelect(chip)}>Go</Button>
    </Dialog>
  );
}
✏️ EditPage.js
JavaScript
import { useEffect, useState } from "react";
import api from "../services/api";
import { useParams } from "react-router-dom";

export default function EditPage() {
  const { chip } = useParams();
  const [data, setData] = useState([]);

  useEffect(() => {
    api.get(`/chip/${chip}`).then(res => {
      const merged = res.data.summary.map(s => ({
        ...s,
        teams: res.data.teams.filter(t=>t.sw_model===s.sw_model)
      }));
      setData(merged);
    });
  }, [chip]);

  const save = async () => {
    await api.post(`/save/${chip}`, { data });
    alert("Saved");
  };

  return (
    <div>
      <h2>{chip}</h2>

      {data.map((row,i)=>(
        <div key={row.sw_model}>
          <h4>{row.sw_model}</h4>

          <input
            value={row.required_panels}
            onChange={(e)=>{
              const newData=[...data];
              newData[i].required_panels=e.target.value;
              setData(newData);
            }}
          />

          {row.teams.map((t,j)=>(
            <div key={t.id}>
              {t.team_name}
              <input onChange={(e)=>t.atsc=e.target.value}/>
            </div>
          ))}
        </div>
      ))}

      <button onClick={save}>Save</button>
    </div>
  );
}
▶️ 5. HOW TO RUN
Step 1: Backend
Bash
cd backend
npm install
node server.js
Step 2: Frontend
Bash
cd frontend
npm install
npm start

import * as Tabs from "@radix-ui/react-tabs"
import { useEffect, useState } from "react"
import axios from "axios"

export default function ModelCompareTabs() {
  return (
    <div className="max-w-4xl mx-auto bg-white shadow p-6 rounded">
      <h1 className="text-2xl font-bold mb-6 text-center">Model Test Parts Comparison</h1>

      <Tabs.Root defaultValue="auto">
        <Tabs.List className="flex border-b mb-4">
          <Tabs.Trigger
            value="auto"
            className="px-4 py-2 text-sm font-medium data-[state=active]:text-blue-600 data-[state=active]:border-b-2 border-blue-600"
          >
            Auto Compare
          </Tabs.Trigger>
          <Tabs.Trigger
            value="manual"
            className="px-4 py-2 text-sm font-medium data-[state=active]:text-blue-600 data-[state=active]:border-b-2 border-blue-600"
          >
            Manual Compare
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="auto">
          <AutoCompareTab />
        </Tabs.Content>

        <Tabs.Content value="manual">
          <ManualCompareTab />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  )
}

function AutoCompareTab() {
  const [baseModel, setBaseModel] = useState("")
  const [derivativeModel, setDerivativeModel] = useState("")
  const [email, setEmail] = useState("")
  const [entries, setEntries] = useState([])

  const fetchEntries = async () => {
    const res = await axios.get("http://localhost:5000/submitted-auto-pairs")
    setEntries(res.data)
  }

  useEffect(() => {
    fetchEntries()
  }, [])

  const handleSubmit = async () => {
    if (!baseModel || !derivativeModel || !email) {
      alert("All fields are required")
      return
    }

    await axios.post("http://localhost:5000/submit-auto-compare", {
      baseModel,
      derivativeModel,
      email,
    })

    setBaseModel("")
    setDerivativeModel("")
    setEmail("")
    fetchEntries()
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Submit for Weekly Auto Compare</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <input
          value={baseModel}
          onChange={(e) => setBaseModel(e.target.value)}
          placeholder="Base Model ID"
          className="border p-2 rounded"
        />
        <input
          value={derivativeModel}
          onChange={(e) => setDerivativeModel(e.target.value)}
          placeholder="Derivative Model ID"
          className="border p-2 rounded"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="border p-2 rounded"
        />
      </div>
      <button
        onClick={handleSubmit}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
      >
        Submit
      </button>

      <div className="mt-6">
        <h3 className="text-md font-semibold mb-2">Submitted Entries</h3>
        <table className="w-full text-sm border">
          <thead>
            <tr className="bg-gray-100 text-left">
              <th className="p-2">#</th>
              <th className="p-2">Base Model</th>
              <th className="p-2">Derivative</th>
              <th className="p-2">Email</th>
              <th className="p-2">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={i} className="border-t">
                <td className="p-2">{i + 1}</td>
                <td className="p-2">{e.base}</td>
                <td className="p-2">{e.derivative}</td>
                <td className="p-2">{e.email}</td>
                <td className="p-2">{new Date(e.date).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ManualCompareTab() {
  const [baseModel, setBaseModel] = useState("")
  const [derivativeModel, setDerivativeModel] = useState("")
  const [result, setResult] = useState([])

  const handleCompare = async () => {
    if (!baseModel || !derivativeModel) {
      alert("Both model IDs are required")
      return
    }

    const res = await axios.post("http://localhost:5000/manual-compare", {
      baseModel,
      derivativeModel,
    })
    setResult(res.data.missingTestParts || [])
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Manual Compare Test Parts</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <input
          value={baseModel}
          onChange={(e) => setBaseModel(e.target.value)}
          placeholder="Base Model ID"
          className="border p-2 rounded"
        />
        <input
          value={derivativeModel}
          onChange={(e) => setDerivativeModel(e.target.value)}
          placeholder="Derivative Model ID"
          className="border p-2 rounded"
        />
      </div>
      <button
        onClick={handleCompare}
        className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
      >
        Compare
      </button>

      {result.length > 0 && (
        <div className="bg-white p-4 mt-4 rounded shadow">
          <h3 className="font-semibold mb-2">Missing Test Parts</h3>
          <ul className="list-disc pl-6 text-sm">
            {result.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const { spawn } = require("child_process");
const cron = require("node-cron");
const bodyParser = require("body-parser");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const AUTO_CSV = path.join(__dirname, "auto_compare", "auto_model_pairs.csv");
const SCRIPT = path.join(__dirname, "auto_compare", "compare_models.py");

// Submit entry for automated processing
app.post("/submit-auto-compare", (req, res) => {
  const { baseModel, derivativeModel, email } = req.body;
  if (!baseModel || !derivativeModel || !email) {
    return res.status(400).json({ error: "All fields required" });
  }

  const row = `${baseModel},${derivativeModel},${email},${new Date().toISOString()}\n`;
  fs.appendFileSync(AUTO_CSV, row);
  res.json({ message: "Submitted for auto comparison." });
});

// Fetch submitted entries
app.get("/submitted-auto-pairs", (req, res) => {
  if (!fs.existsSync(AUTO_CSV)) return res.json([]);
  const data = fs.readFileSync(AUTO_CSV, "utf-8").trim().split("\n").map(line => {
    const [base, derivative, email, date] = line.split(",");
    return { base, derivative, email, date };
  });
  res.json(data);
});

// Manual comparison
app.post("/manual-compare", (req, res) => {
  const { baseModel, derivativeModel } = req.body;
  if (!baseModel || !derivativeModel) {
    return res.status(400).json({ error: "Model IDs required" });
  }

  const process = spawn("python3", [SCRIPT, baseModel, derivativeModel]);

  let result = "";
  process.stdout.on("data", data => result += data.toString());
  process.stderr.on("data", data => console.error("Python Error:", data.toString()));

  process.on("close", code => {
    try {
      const parsed = JSON.parse(result);
      res.json(parsed);
    } catch (e) {
      console.error("Failed to parse:", result);
      res.status(500).json({ error: "Failed to compare models." });
    }
  });
});

// Auto run on Monday 8am
cron.schedule("0 8 * * 1", () => {
  const autoProcess = spawn("python3", [SCRIPT, "--auto"]);

  autoProcess.stdout.on("data", d => console.log("[AUTO]", d.toString()));
  autoProcess.stderr.on("data", d => console.error("[AUTO ERROR]", d.toString()));
});


