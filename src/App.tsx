import { Tldraw } from "tldraw";
import "tldraw/tldraw.css";

function App() {
  return (
    <div className="max-w-7xl mx-auto p-8 text-center">
      <div style={{ position: "fixed", inset: 0 }}>
        <Tldraw />
      </div>
    </div>
  );
}

export default App;
