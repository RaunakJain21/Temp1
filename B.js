import { useEffect, useState } from "react";
import api from "../services/api";
import {
  Box, Typography, Button, Card, CardContent,
  IconButton, Collapse
} from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import { useNavigate } from "react-router-dom";
import ChipSelectDialog from "./ChipSelectDialog";

export default function Dashboard() {
  const [rows, setRows] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [expandAll, setExpandAll] = useState(false);
  const [teamData, setTeamData] = useState({});
  const [dialog, setDialog] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/hardware").then(async (res) => {
      setRows(res.data);

      const grouped = {};
      for (let r of res.data) {
        const chipRes = await api.get(`/chip/${r.chip_name}`);
        grouped[r.sw_model] = chipRes.data.teams.filter(
          t => t.sw_model === r.sw_model
        );
      }
      setTeamData(grouped);
    });
  }, []);

  const chips = [...new Set(rows.map(r => r.chip_name))];

  const handleSelect = async (chip) => {
    try {
      await api.post(`/lock/${chip}`);
      navigate(`/edit/${chip}`);
    } catch (e) {
      alert("Locked by: " + e.response.data.by);
    }
  };

  const toggleAll = () => {
    const newState = !expandAll;
    setExpandAll(newState);

    const all = {};
    rows.forEach(r => (all[r.sw_model] = newState));
    setExpanded(all);
  };

  // ===== STYLES =====
  const thStyle = {
    textAlign: "left",
    padding: "10px",
    fontWeight: 600,
    borderBottom: "2px solid #cfd8dc"
  };

  const numHeader = {
    ...thStyle,
    width: "70px",
    textAlign: "center"
  };

  const tdText = {
    padding: "8px 10px"
  };

  const tdNum = {
    padding: "8px",
    textAlign: "center",
    width: "70px"
  };

  const iconCell = {
    width: "40px",
    textAlign: "center"
  };

  return (
    <Box p={3} sx={{ background: "linear-gradient(120deg,#f0f4ff,#f9fbff)", minHeight: "100vh" }}>
      <Typography variant="h4" mb={3} fontWeight={700}>
        Hardware Management Dashboard
      </Typography>

      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ display: "flex", gap: 2 }}>
          <Button variant="contained" onClick={() => setDialog(true)}>
            Edit Chip Data
          </Button>

          <Button variant="outlined" onClick={toggleAll}>
            {expandAll ? "Collapse All" : "Expand All"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead style={{ background: "#e3eafc" }}>
              <tr>
                <th style={thStyle}></th>
                <th style={{ ...thStyle, width: "18%" }}>SW Model</th>
                <th style={{ ...thStyle, width: "12%" }}>Chip</th>
                <th style={numHeader}>Req</th>
                <th style={numHeader}>Exist</th>
                <th style={numHeader}>Short</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row, index) => {
                const isOpen = expanded[row.sw_model];
                const shortage = row.required_panels - row.existing_panels;

                return (
                  <>
                    <tr style={{
                      borderBottom: "1px solid #ddd",
                      background: index % 2 ? "#fafafa" : "#fff"
                    }}>
                      <td style={iconCell}>
                        <IconButton size="small" onClick={() =>
                          setExpanded(prev => ({
                            ...prev,
                            [row.sw_model]: !prev[row.sw_model]
                          }))
                        }>
                          {isOpen ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                        </IconButton>
                      </td>

                      <td style={tdText}>{row.sw_model}</td>
                      <td style={tdText}>{row.chip_name}</td>
                      <td style={tdNum}>{row.required_panels}</td>
                      <td style={tdNum}>{row.existing_panels}</td>

                      <td style={{
                        ...tdNum,
                        color: shortage > 0 ? "#d32f2f" : "#2e7d32",
                        fontWeight: 600
                      }}>
                        {shortage}
                      </td>
                    </tr>

                    <tr>
                      <td colSpan={6} style={{ padding: 0 }}>
                        <Collapse in={isOpen}>
                          <Box sx={{ p: 2, background: "#f9fbff" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                              <thead style={{ background: "#dfe6ff" }}>
                                <tr>
                                  <th style={{ ...thStyle, width: "18%" }}>Team</th>
                                  <th style={numHeader}>ATSC</th>
                                  <th style={numHeader}>DVB</th>
                                  <th style={numHeader}>ISDB</th>
                                  <th style={numHeader}>AOT</th>
                                  <th style={numHeader}>Total</th>
                                  <th style={{ ...thStyle, width: "30%" }}>Remarks</th>
                                </tr>
                              </thead>

                              <tbody>
                                {(teamData[row.sw_model] || []).map(t => (
                                  <tr key={t.id} style={{ borderBottom: "1px solid #eee" }}>
                                    <td style={tdText}>{t.team_name}</td>
                                    <td style={tdNum}>{t.atsc}</td>
                                    <td style={tdNum}>{t.dvb}</td>
                                    <td style={tdNum}>{t.isdb}</td>
                                    <td style={tdNum}>{t.aot}</td>
                                    <td style={{ ...tdNum, fontWeight: 600 }}>
                                      {t.atsc + t.dvb + t.isdb + t.aot}
                                    </td>
                                    <td style={tdText}>{t.remarks}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </Box>
                        </Collapse>
                      </td>
                    </tr>
                  </>
                );
              })}
            </tbody>
          </table>

        </CardContent>
      </Card>

      <ChipSelectDialog open={dialog} chips={chips} onSelect={handleSelect} />
    </Box>
  );




import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../services/api";
import {
  Box, Typography, Card, CardContent,
  TextField, Grid, Button
} from "@mui/material";

export default function EditPage() {
  const { chip } = useParams();
  const [data, setData] = useState([]);

  useEffect(() => {
    api.get(`/chip/${chip}`).then(res => {
      const merged = res.data.summary.map(s => ({
        ...s,
        teams: res.data.teams.filter(t => t.sw_model === s.sw_model)
      }));
      setData(merged);
    });
  }, [chip]);

  const updateMain = (i, field, val) => {
    const newData = [...data];
    newData[i][field] = val;
    setData(newData);
  };

  const updateTeam = (i, j, field, val) => {
    const newData = [...data];
    newData[i].teams[j][field] = val;
    setData(newData);
  };

  const save = async () => {
    await api.post(`/save/${chip}`, { data });
    alert("Saved");
  };

  return (
    <Box p={3}>
      <Typography variant="h4" mb={3}>
        Edit Chip: {chip}
      </Typography>

      {data.map((row, i) => (
        <Card key={row.sw_model} sx={{ mb: 3 }}>
          <CardContent>

            <Typography variant="h6">{row.sw_model}</Typography>

            <TextField
              label="Required Panels"
              type="number"
              value={row.required_panels}
              onChange={(e) => updateMain(i, "required_panels", e.target.value)}
              sx={{ mb: 2 }}
            />

            <Grid container spacing={2}>
              {row.teams.map((t, j) => (
                <Grid item xs={12} key={t.id}>
                  <Card sx={{ p: 2, background: "#f9fbff" }}>
                    <Typography fontWeight={600}>{t.team_name}</Typography>

                    <Grid container spacing={1} mt={1}>
                      {["atsc", "dvb", "isdb", "aot"].map(f => (
                        <Grid item xs={3} key={f}>
                          <TextField
                            label={f.toUpperCase()}
                            type="number"
                            value={t[f]}
                            onChange={(e) => updateTeam(i, j, f, e.target.value)}
                            fullWidth
                          />
                        </Grid>
                      ))}

                      <Grid item xs={12}>
                        <TextField
                          label="Remarks"
                          value={t.remarks}
                          onChange={(e) => updateTeam(i, j, "remarks", e.target.value)}
                          fullWidth
                        />
                      </Grid>
                    </Grid>
                  </Card>
                </Grid>
              ))}
            </Grid>

          </CardContent>
        </Card>
      ))}

      <Button variant="contained" size="large" onClick={save}>
        Save All Changes
      </Button>
    </Box>
  );
}


}
