import React, { useState, useCallback } from "react";
import { trim } from "lodash";
import {
  Button,
  Card,
  CardContent,
  CardActions,
  TextField,
  Switch,
  FormControlLabel,
} from "@mui/material";
import { Send as SendIcon } from "@mui/icons-material";

const serverUrl = `${import.meta.env.VITE_API_HOST}:${import.meta.env.VITE_API_PORT}`;

const _sendQuery = async (query: string) => {
  console.log("serverUrl:", serverUrl);
  const response = await fetch(`${serverUrl}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: trim(query) }),
  });
  if (response.status && response.status === 200) {
    const result = await response.json();
    console.log("_sendQuery() Query result: ", result);
    return result;
  }
  return false;
};

interface QueryBoxProps {
  query: string;
  handleQuery: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleSend: () => void;
  // darkMode: boolean;
  // toggleDarkMode: () => void;
}
const QueryBox: React.FC<QueryBoxProps> = ({
  query,
  handleQuery,
  handleSend,
}) => {
  return (
    <Card>
      <CardContent>
        <TextField
          multiline
          maxRows={3}
          value={query}
          onChange={handleQuery}
          defaultValue="Enter a query"
          fullWidth
        />
      </CardContent>
      <CardActions>
        <Button
          component="label"
          role={undefined}
          variant="contained"
          startIcon={<SendIcon />}
          onClick={handleSend}
        >
          Send
        </Button>
      </CardActions>
    </Card>
  );
};

const Gpt = () => {
  const [query, setQuery] = useState<string>("");
  const [sending, setSending] = useState<boolean>(false);
  const [result, setResult] = useState<{ [key: string]: any }>({});

  const handleQuery = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setQuery(value);
      // eslint-disable-next-line
    },
    [],
  );

  const handleSend = useCallback(() => {
    // Send query to API
    setSending(true);
    _sendQuery(query).then((res) => {
      console.log("res", res);
      setResult(res || "[No Data]");
    });
    //console.log(`Query Result: `, result);
    // if( !response.ok ) {
    //   console.log('Request error');
    // }
    setSending(false);
  }, [query]);

  const ResultBox = () => {
    return (
      <React.Fragment>
        <p>&nbsp;</p>
        <Card>
          <CardContent>
            <TextField
              multiline
              maxRows={10}
              value={result ? JSON.stringify(result, null, 2) : ""}
              aria-readonly
              fullWidth
              placeholder="Awaiting query..."
            />
          </CardContent>
          <CardActions>
            <React.Fragment />
          </CardActions>
        </Card>
      </React.Fragment>
    );
  };

  return (
    <div>
      Hello GPT!!
      <br />
      <QueryBox
        query={query}
        handleQuery={handleQuery}
        handleSend={handleSend}
      />
      <ResultBox />
    </div>
  );
};

export default Gpt;
