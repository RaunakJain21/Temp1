const express = require("express");
const router = express.Router();
const { lockChip } = require("../controllers/lockController");

router.post("/lock/:chip", lockChip);

module.exports = router;

const express = require("express");
const router = express.Router();
const {
  getAllHardware,
  getChipData,
  saveData
} = require("../controllers/hardwareController");

router.get("/hardware", getAllHardware);
router.get("/chip/:chip", getChipData);
router.post("/save/:chip", saveData);

module.exports = router;

const db = require("../db");

// GET ALL SUMMARY DATA
exports.getAllHardware = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        sw_model,
        chip_name,
        required_panels,
        SUM(atsc + dvb + isdb + aot) AS existing_panels
      FROM hardware
      GROUP BY sw_model
    `);

    res.json(rows);
  } catch (err) {
    res.status(500).json(err);
  }
};

// GET CHIP DATA (SUMMARY + TEAM DATA)
exports.getChipData = async (req, res) => {
  const { chip } = req.params;

  try {
    const [summary] = await db.query(
      "SELECT * FROM hardware WHERE chip_name = ? GROUP BY sw_model",
      [chip]
    );

    const [teams] = await db.query(
      "SELECT * FROM hardware WHERE chip_name = ?",
      [chip]
    );

    res.json({ summary, teams });
  } catch (err) {
    res.status(500).json(err);
  }
};

// SAVE DATA
exports.saveData = async (req, res) => {
  const { chip } = req.params;
  const { data } = req.body;

  try {
    for (let row of data) {
      await db.query(
        `UPDATE hardware 
         SET required_panels = ? 
         WHERE sw_model = ? AND chip_name = ?`,
        [row.required_panels, row.sw_model, chip]
      );

      for (let t of row.teams) {
        await db.query(
          `UPDATE hardware 
           SET atsc=?, dvb=?, isdb=?, aot=?, remarks=? 
           WHERE id=?`,
          [t.atsc, t.dvb, t.isdb, t.aot, t.remarks, t.id]
        );
      }
    }

    res.json({ message: "Saved successfully" });
  } catch (err) {
    res.status(500).json(err);
  }
};




let locks = {}; // in-memory lock

exports.lockChip = (req, res) => {
  const { chip } = req.params;
  const user = req.ip;

  if (locks[chip] && locks[chip] !== user) {
    return res.status(400).json({ by: locks[chip] });
  }

  locks[chip] = user;
  res.json({ message: "Locked" });
};
