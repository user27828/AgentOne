/**
 * Chat query box
 */
import React, { useState, useEffect } from "react";
import { size } from "lodash";
import {
  Card,
  CardContent,
  Grid2 as Grid,
  IconButton,
  InputAdornment,
  TextField,
  Tooltip,
} from "@mui/material";
import { Cancel as CancelIcon, Send as SendIcon } from "@mui/icons-material";

interface QueryBoxProps {
  query: string;
  queryFieldRef?: any;
  handleQuery: (event: React.ChangeEvent<HTMLInputElement> | string) => void;
  handleSend: (event: React.FormEvent) => void;
  handleCancel: () => void;
  models: string[];
  selectedModel: string;
  stream: boolean;
  handleStreamChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  loading: boolean;
  sending: boolean;
}

/**
 * Query box and settings component
 * @param param0
 * @returns {JSX.Element}
 * @component
 */
const QueryBox: React.FC<QueryBoxProps> = ({
  query,
  queryFieldRef,
  handleQuery,
  handleSend,
  handleCancel,
  models,
  loading,
  sending,
}) => {
  const [localQuery, setLocalQuery] = useState<string>("");

  // No need to send this outside of this component
  const handleLocalQuery = (event: React.ChangeEvent<HTMLInputElement>) =>
    setLocalQuery(event.target.value);

  /**
   * Handle the "Enter" button as submit
   * @param {object} event
   */
  const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      // Prevent the default "Enter" behavior to avoid newline in TextField
      handleLocalSend(event);
    }
  };

  const handleLocalSend = (event: React.FormEvent) => {
    event.preventDefault();
    handleQuery(localQuery);
    handleSend(event);
    setLocalQuery("");
  };

  useEffect(() => setLocalQuery(query), [query]);

  return (
    <Card>
      <CardContent>
        <Grid container spacing={2}>
          <Grid size={12}>
            <form onSubmit={(e) => e.preventDefault()}>
              <Tooltip
                title={
                  !size(models)
                    ? "Loading models... or no models available"
                    : null
                }
              >
                <TextField
                  multiline
                  maxRows={5}
                  value={localQuery}
                  onChange={handleLocalQuery}
                  onKeyDown={handleKeyPress}
                  placeholder={
                    !sending ? "Enter a query" : "(Waiting for response...)"
                  }
                  fullWidth
                  disabled={loading || sending || !size(models)}
                  slotProps={{
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">
                          <Tooltip title="Send query.  Press enter or click this button to send. Shift+Enter for newlines.">
                            <IconButton
                              component="label"
                              role={undefined}
                              onClick={handleLocalSend}
                              disabled={sending || !size(models)}
                            >
                              <SendIcon
                                color={
                                  sending || !size(models)
                                    ? "inherit"
                                    : "primary"
                                }
                              />
                            </IconButton>
                          </Tooltip>
                          &nbsp;&nbsp;
                          <Tooltip title="Cancel processing query">
                            <IconButton
                              component="label"
                              role={undefined}
                              onClick={handleCancel}
                              disabled={!sending}
                            >
                              <CancelIcon
                                color={sending ? "error" : "inherit"}
                              />
                            </IconButton>
                          </Tooltip>
                        </InputAdornment>
                      ),
                    },
                  }}
                  inputRef={queryFieldRef}
                />
              </Tooltip>
            </form>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
};

export default QueryBox;
