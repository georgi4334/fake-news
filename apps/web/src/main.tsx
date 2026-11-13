import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import "./index.css";
import { History } from "./routes/History";
import { Home } from "./routes/Home";
import { Layout } from "./routes/Layout";
import { Methodology } from "./routes/Methodology";
import { ReportPage } from "./routes/ReportPage";

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/report/:id", element: <ReportPage /> },
      { path: "/history", element: <History /> },
      { path: "/methodology", element: <Methodology /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
