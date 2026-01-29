import React from 'react'
import ReactDOM from 'react-dom/client'
import MyChart from './MyChart'
import AdvancedChart from './AdvancedChart'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <div style={{ fontFamily: 'sans-serif', padding: '20px' }}>
      <h1>Grafico generato da Python (MyChart)</h1>
      <MyChart />
      
      <hr style={{ margin: '40px 0' }} />
      
      <h1>Replica Logica Python (AdvancedChart)</h1>
      <p>Simulazione della logica pandas (group by, merge, cumsum) direttamente in React</p>
      <AdvancedChart />
    </div>
  </React.StrictMode>,
)
