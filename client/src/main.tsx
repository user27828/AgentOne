/**
 * Main wrapper
 */
import { StrictMode, lazy, Suspense } from "react";
import { createRoot, type Root as ReactRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { CookiesProvider } from "react-cookie";
import {
  Box,
  CircularProgress,
  CssBaseline,
  ThemeProvider,
  createTheme,
  IconButton,
  Tooltip,
  useColorScheme,
} from "@mui/material";
import {
  Brightness2 as DarkModeIcon,
  WbSunny as LightModeIcon,
} from "@mui/icons-material";
import "./index.css";

const Root = lazy(() => import("./pages/root.tsx"));
const Gpt = lazy(() => import("./pages/gpt.tsx"));

const theme = createTheme({
  colorSchemes: {
    light: true,
    dark: true,
  },
  cssVariables: {
    colorSchemeSelector: "class",
  },
  components: {
    MuiContainer: {
      styleOverrides: {
        root: {
          maxWidth: "100%",
        },
      },
    },
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
});

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

const ColorSchemeToggle = () => {
  const { mode, systemMode, setMode } = useColorScheme();

  if (!mode && !systemMode) {
    return null;
  }

  const resolvedMode: "light" | "dark" =
    mode === "dark"
      ? "dark"
      : mode === "light"
        ? "light"
        : systemMode || "light";
  const nextMode = resolvedMode === "dark" ? "light" : "dark";

  return (
    <Tooltip title={`Switch to ${nextMode} mode`}>
      <IconButton
        aria-label={`Switch to ${nextMode} mode`}
        sx={{ position: "absolute", top: 3, left: 2, zIndex: 10000 }}
        onClick={() => setMode(nextMode)}
        color="inherit"
      >
        {resolvedMode === "dark" ? <LightModeIcon /> : <DarkModeIcon />}
      </IconButton>
    </Tooltip>
  );
};

/**
 * Main component with MUI light/dark mode toggle
 * @component
 * @returns {JSX.Element}
 */
export const App = () => {
  return (
    <ThemeProvider
      theme={theme}
      defaultMode="system"
      disableTransitionOnChange
      noSsr
    >
      <CssBaseline />
      <ColorSchemeToggle />
      <Suspense
        fallback={
          <Box
            sx={{
              minHeight: "100vh",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CircularProgress />
          </Box>
        }
      >
        <RouterProvider router={router} />
      </Suspense>
    </ThemeProvider>
  );
};

type RootContainer = HTMLElement & {
  __agentOneReactRoot?: ReactRoot;
};

const rootContainer = document.getElementById("root") as RootContainer | null;

if (!rootContainer) {
  throw new Error("Root container not found");
}

const reactRoot =
  rootContainer.__agentOneReactRoot || createRoot(rootContainer);
rootContainer.__agentOneReactRoot = reactRoot;

reactRoot.render(
  <StrictMode>
    <CookiesProvider defaultSetOptions={{ path: "/", sameSite: "lax" }}>
      <App />
    </CookiesProvider>
  </StrictMode>,
);
