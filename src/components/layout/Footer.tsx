export function Footer() {
  return (
    <footer className="bg-card border-t py-6 text-center text-sm text-muted-foreground">
      <div className="container mx-auto px-4">
        <p>&copy; {new Date().getFullYear()} PingPongTracker. All rights reserved.</p>
        <p className="mt-1">Elevate Your Game.</p>
      </div>
    </footer>
  );
}
