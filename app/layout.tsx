import type { Metadata } from "next";
import { DataProvider } from "@/lib/data-context";
import { AuthProvider } from "@/lib/auth-context";
import { Toaster } from "sonner";
import "@/styles.css";

export const metadata: Metadata = {
  title: "Harvesters Church Management System",
  description:
    "Streamline attendance tracking, department coordination, and worker management for Harvesters International Christian Centre.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen font-sans antialiased">
        <DataProvider>
          <AuthProvider>
            {children}
            <Toaster position="top-right" />
          </AuthProvider>
        </DataProvider>
      </body>
    </html>
  );
}
