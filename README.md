# Temp1

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


