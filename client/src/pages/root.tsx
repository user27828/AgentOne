import { useState } from "react";
import { Card, CardContent, Button, Link, Box } from "@mui/material";
import reactLogo from "../assets/react.svg";
import viteLogo from "/vite.svg";
import "../App.css";

function App() {
  const [count, setCount] = useState(0);

  return (
    <Box sx={{ maxWidth: "500px", padding: "2em", textAlign: "center" }}>
      <Box>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </Box>
      <h1>Vite + React</h1>
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Button component={Link} variant="outlined" href="/gpt">
            Talk to the GPT
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Button
            variant="outlined"
            onClick={() => setCount((count) => count + 1)}
          >
            count is {count}
          </Button>
          <p>
            Edit <code>src/pages/Root.tsx</code> and save to test HMR
          </p>
        </CardContent>
      </Card>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </Box>
  );
}

export default App;
