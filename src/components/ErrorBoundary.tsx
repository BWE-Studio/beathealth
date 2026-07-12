import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertTriangle, RefreshCw, Home, Phone } from "lucide-react";
import { logRuntimeObject } from "@/lib/runtimeDebug";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("========== ERROR BOUNDARY DEBUG ==========");
    console.error("EXACT EXCEPTION", error);
    console.error("ERROR NAME", error.name);
    console.error("ERROR MESSAGE", error.message);
    console.error("ERROR STACK", error.stack);
    console.error("COMPONENT STACK", errorInfo.componentStack);
    logRuntimeObject("ERROR OBJECT", error);
    logRuntimeObject("ERROR INFO", errorInfo);
    console.error("CURRENT URL", window.location.href);
    console.error("==========================================");
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  private handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = "/app/home";
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
          <Card className="max-w-md w-full p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
            
            <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
            <p className="text-muted-foreground mb-6">
              We apologize for the inconvenience. Please try again or contact support if the problem persists.
            </p>

            <div className="space-y-3">
              <Button onClick={this.handleRetry} className="w-full gap-2">
                <RefreshCw className="w-4 h-4" />
                Try Again
              </Button>
              
              <Button variant="outline" onClick={this.handleGoHome} className="w-full gap-2">
                <Home className="w-4 h-4" />
                Go to Dashboard
              </Button>

              <Button
                variant="ghost"
                className="w-full gap-2 text-primary"
                onClick={() => window.location.href = "/contact"}
              >
                <Phone className="w-4 h-4" />
                Contact Support
              </Button>
            </div>

            {process.env.NODE_ENV === "development" && this.state.error && (
              <details className="mt-6 text-left">
                <summary className="text-sm text-muted-foreground cursor-pointer">
                  Error Details
                </summary>
                <pre className="mt-2 p-3 bg-muted rounded text-xs overflow-auto">
                  {this.state.error.toString()}
                </pre>
              </details>
            )}
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
