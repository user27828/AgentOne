/**
 * Main wrapper
 */
import { useMemo, useState, useEffect, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { CookiesProvider } from "react-cookie";
import {
  CssBaseline,
  ThemeProvider,
  createTheme,
  IconButton,
} from "@mui/material";
import {
  Brightness2 as DarkModeIcon,
  WbSunny as LightModeIcon,
} from "@mui/icons-material";
import "./index.css";
import Root from "./pages/root.tsx";
import Gpt from "./pages/gpt.tsx";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Root />,
  },
  {
    path: "/gpt",
    element: <Gpt />,
  },
]);

/**
 * Main component with MUI light/dark mode toggle
 * @component
 * @returns {JSX.Element}
 */
// eslint-disable-next-line react-refresh/only-export-components
const App = () => {
  // Saved theme preference
  const savedTheme = localStorage.getItem("theme");
  const [darkMode, setDarkMode] = useState(savedTheme === "dark");

  const theme = useMemo(
    () =>
      createTheme({
        components: {
          MuiContainer: {
            styleOverrides: {
              root: {
                maxWidth: "100%",
              },
            },
          },
        },
        palette: {
          mode: darkMode ? "dark" : "light",
        },
        typography: {
          fontSize: 17,
          fontFamily: [
            "Ginto",
            "ui-sans-serif",
            "system-ui",
            "sans-serif",
            "Segoe UI Emoji",
            "Segoe UI Symbol",
            "Noto Color Emoji",
            "Segoe UI Emoji",
            "Apple Color Emoji",
          ].join(","),
        },
      }),
    [darkMode],
  );

  const toggleTheme = () => {
    setDarkMode((prev) => {
      const newTheme = !prev ? "dark" : "light"; // Switch themes?
      localStorage.setItem("theme", newTheme); // Save to localStorage
      return !prev; // Toggle theme state
    });
  };

  /**
   * On initial render, apply the saved theme
   */
  useEffect(() => {
    if (savedTheme) {
      setDarkMode(savedTheme === "dark");
    }
  }, [savedTheme]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <IconButton
        sx={{ position: "absolute", top: 3, left: 2, zIndex: 10000 }}
        onClick={toggleTheme}
        color="inherit"
      >
        {darkMode ? <LightModeIcon /> : <DarkModeIcon />}
      </IconButton>
      <RouterProvider router={router} />
    </ThemeProvider>
  );
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CookiesProvider defaultSetOptions={{ path: "/", sameSite: "lax" }}>
      <App />
    </CookiesProvider>
  </StrictMode>,
);
