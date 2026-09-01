import "./globals.css";
import "./menu.css";
import "leaflet/dist/leaflet.css";

export const metadata = {
  title: "Landslide Watch | NER",
  description: "Landslide early warning system for North East India",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
