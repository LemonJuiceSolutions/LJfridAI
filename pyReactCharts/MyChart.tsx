import React from "react";
import {
  ResponsiveContainer, 
  LineChart, Line, 
  BarChart, Bar, 
  AreaChart, Area,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid
} from "recharts";

interface ChartData {
  mese: string;
  Budget: number;
  Fatturato: number;
  Prodotto: number;
}

const data: ChartData[] = [{"mese": "Gen", "Budget": 100, "Fatturato": 80, "Prodotto": 60}, {"mese": "Feb", "Budget": 120, "Fatturato": 90, "Prodotto": 70}, {"mese": "Mar", "Budget": 130, "Fatturato": 110, "Prodotto": 85}];

const MyChart: React.FC = () => {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "40px", paddingBottom: "40px" }}>
      
      {/* Line Chart */}
      <div style={{ width: "100%", height: 360 }}>
        <h3 style={{ textAlign: "center" }}>Andamento Mensile (Linee)</h3>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="mese" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="Budget" stroke="#8884d8" dot={{ r: 5 }} />
            <Line type="monotone" dataKey="Fatturato" stroke="#82ca9d" dot={{ r: 5 }} />
            <Line type="monotone" dataKey="Prodotto" stroke="#ffc658" dot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Bar Chart */}
      <div style={{ width: "100%", height: 360 }}>
        <h3 style={{ textAlign: "center" }}>Confronto Budget vs Reale (Barre)</h3>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="mese" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="Budget" fill="#8884d8" />
            <Bar dataKey="Fatturato" fill="#82ca9d" />
            <Bar dataKey="Prodotto" fill="#ffc658" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Area Chart */}
      <div style={{ width: "100%", height: 360 }}>
        <h3 style={{ textAlign: "center" }}>Volumi Cumulativi (Aree)</h3>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="mese" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Area type="monotone" dataKey="Budget" stackId="1" stroke="#8884d8" fill="#8884d8" />
            <Area type="monotone" dataKey="Fatturato" stackId="1" stroke="#82ca9d" fill="#82ca9d" />
            <Area type="monotone" dataKey="Prodotto" stackId="1" stroke="#ffc658" fill="#ffc658" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
};

export default MyChart;
