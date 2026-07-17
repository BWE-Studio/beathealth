import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { getAuthRedirectUrl, isNativePlatform, openNativeOAuthUrl } from "@/lib/nativeAuth";
// import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";
import { ArrowRight, Loader2, Mail, ArrowLeft, Sparkles } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { hideNativeSplash } from "@/lib/nativeSplash";
import { useAuth } from "@/hooks/useAuth";
import { z } from "zod";

// Validation schemas for authentication inputs
const emailSchema = z.string()
  .trim()
  .min(1, "Email is required")
  .email("Please enter a valid email address")
  .max(255, "Email must be less than 255 characters");

const passwordSchema = z.string()
  .min(8, "Password must be at least 8 characters")
  .max(100, "Password must be less than 100 characters");

type AuthMode = "select" | "email" | "magic-link" | "reset-password" | "update-password";
type RecoverySessionStatus = "idle" | "checking" | "ready" | "missing";

const Auth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { language } = useLanguage();
  const { isAuthenticated } = useAuth();
  const isUpdatePasswordMode = searchParams.get("mode") === "update-password";
  const [authMode, setAuthMode] = useState<AuthMode>(
    isUpdatePasswordMode ? "update-password" : "select"
  );
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [signUpConfirmationSent, setSignUpConfirmationSent] = useState(false);
  const [pendingPostAuthRedirect, setPendingPostAuthRedirect] = useState(false);
  const [recoverySessionStatus, setRecoverySessionStatus] = useState<RecoverySessionStatus>(
    isUpdatePasswordMode ? "checking" : "idle"
  );

  useEffect(() => {
    hideNativeSplash();
  }, []);

  useEffect(() => {
    if (!isUpdatePasswordMode) return;

    let cancelled = false;
    setAuthMode("update-password");
    setRecoverySessionStatus("checking");

    const verifyRecoverySession = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (cancelled) return;

      setRecoverySessionStatus(!error && session ? "ready" : "missing");
    };

    void verifyRecoverySession();

    return () => {
      cancelled = true;
    };
  }, [isUpdatePasswordMode]);

  useEffect(() => {
    if (!pendingPostAuthRedirect || !isAuthenticated || isUpdatePasswordMode) return;

    setPendingPostAuthRedirect(false);
    navigate("/app/home", { replace: true });
  }, [isAuthenticated, isUpdatePasswordMode, navigate, pendingPostAuthRedirect]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Reset errors
    setEmailError(null);
    setPasswordError(null);
    
    // Validate inputs
    const emailValidation = emailSchema.safeParse(email);
    const passwordValidation = passwordSchema.safeParse(password);
    
    if (!emailValidation.success) {
      setEmailError(emailValidation.error.errors[0].message);
      return;
    }
    
    if (!passwordValidation.success) {
      setPasswordError(passwordValidation.error.errors[0].message);
      return;
    }
    
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ 
          email: emailValidation.data, 
          password: passwordValidation.data 
        });
        if (error) throw error;
        toast.success(language === "hi" ? "स्वागत है!" : "Welcome back!");
        setPendingPostAuthRedirect(true);
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: emailValidation.data,
          password: passwordValidation.data,
          options: { emailRedirectTo: getAuthRedirectUrl("/app/home") },
        });
        if (error) throw error;

        if (data.session) {
          toast.success(language === "hi" ? "खाता बन गया! लॉगिन हो रहा है..." : "Account created! Logging you in...");
          setPendingPostAuthRedirect(true);
        } else {
          setSignUpConfirmationSent(true);
          toast.success(
            language === "hi"
              ? "खाता बन गया! पुष्टि के लिए अपना ईमेल देखें।"
              : "Account created! Check your email to confirm it."
          );
        }
      }
    } catch (error: unknown) {
      setPendingPostAuthRedirect(false);
      const message = error instanceof Error ? error.message : language === "hi" ? "प्रमाणीकरण विफल": "Authentication failed";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const emailValidation = emailSchema.safeParse(email);
    if (!emailValidation.success) {
      setEmailError(emailValidation.error.errors[0].message);
      return;
    }
    
    setLoading(true);
    setEmailError(null);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: emailValidation.data,
        options: {
          emailRedirectTo: getAuthRedirectUrl("/app/home"),
        },
      });
      if (error) throw error;
      setMagicLinkSent(true);
      toast.success(language === "hi" ? "मैजिक लिंक भेजा गया!" : "Magic link sent! Check your email.");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : language === "hi" ?  "लिंक भेजने में विफल" : "Failed to send magic link"
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const emailValidation = emailSchema.safeParse(email);
    if (!emailValidation.success) {
      setEmailError(emailValidation.error.errors[0].message);
      return;
    }
    
    setLoading(true);
    setEmailError(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(emailValidation.data, {
        redirectTo: getAuthRedirectUrl("/auth?mode=update-password"),
      });
      if (error) throw error;
      setResetSent(true);
      toast.success(language === "hi" ? "रीसेट लिंक भेजा गया!" : "Reset link sent! Check your email.");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : (language === "hi" ? "रीसेट लिंक भेजने में विफल" : "Failed to send reset link")
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setConfirmPasswordError(null);

    const passwordValidation = passwordSchema.safeParse(newPassword);
    if (!passwordValidation.success) {
      setPasswordError(
        language === "hi"
          ? "पासवर्ड कम से कम 8 अक्षरों का होना चाहिए"
          : passwordValidation.error.errors[0].message
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setConfirmPasswordError(
        language === "hi" ? "दोनों पासवर्ड मेल नहीं खाते" : "Passwords do not match"
      );
      return;
    }

    setLoading(true);

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        setRecoverySessionStatus("missing");
        return;
      }

      const { error } = await supabase.auth.updateUser({
        password: passwordValidation.data,
      });
      if (error) throw error;

      toast.success(
        language === "hi"
          ? "आपका पासवर्ड सफलतापूर्वक बदल दिया गया है"
          : "Your password has been updated successfully"
      );
      navigate("/app/home", { replace: true });
    } catch (error: unknown) {
      const message = error instanceof Error
        ? error.message
        : language === "hi"
          ? "पासवर्ड बदलने में विफल"
          : "Failed to update password";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      if (isNativePlatform()) {
        await supabase.auth.signOut({ scope: "local" });
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: getAuthRedirectUrl("/app/home"),
          skipBrowserRedirect: isNativePlatform(),
          queryParams: {
            prompt: "select_account",
          },
        },
      });
      if (error) throw error;

      if (isNativePlatform() && data.url) {
        await openNativeOAuthUrl(data.url);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : language === "hi" ? "Google साइन-इन विफल" : "Google sign-in failed";
      toast.error(message);
      setLoading(false);
    }
  };

  const renderSelectMode = () => (
    <div className="space-y-4">
      <Button
        onClick={handleGoogleSignIn}
        variant="outline"
        className="w-full h-14 text-lg gap-3 border-2"
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <>
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            {language === "hi" ? "Google से साइन इन करें" : "Sign in with Google"}
          </>
        )}
      </Button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border/50" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">
            {language === "hi" ? "या" : "or"}
          </span>
        </div>
      </div>

      <Button
        onClick={() => setAuthMode("magic-link")}
        variant="outline"
        className="w-full h-14 text-lg gap-3 border-2"
      >
        <Sparkles className="w-5 h-5" />
        {language === "hi" ? "मैजिक लिंक से लॉगिन" : "Sign in with Magic Link"}
      </Button>

      <Button
        onClick={() => setAuthMode("email")}
        variant="outline"
        className="w-full h-14 text-lg gap-3 border-2"
      >
        <Mail className="w-5 h-5" />
        {language === "hi" ? "ईमेल और पासवर्ड" : "Email & Password"}
      </Button>

      <p className="text-xs text-center text-muted-foreground pt-4">
        {language === "hi" 
          ? "जारी रखकर, आप हमारी शर्तों और गोपनीयता नीति से सहमत होते हैं"
          : "By continuing, you agree to our Terms & Privacy Policy"}
      </p>
    </div>
  );

  const renderMagicLinkMode = () => (
    <form onSubmit={handleMagicLink} className="space-y-6">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mb-2"
        onClick={() => {
          setAuthMode("select");
          setMagicLinkSent(false);
        }}
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        {language === "hi" ? "वापस" : "Back"}
      </Button>

      {magicLinkSent ? (
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
            <Mail className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-xl font-semibold">
            {language === "hi" ? "अपना ईमेल जांचें" : "Check your email"}
          </h3>
          <p className="text-muted-foreground text-sm">
            {language === "hi" 
              ? `हमने ${email} पर एक मैजिक लिंक भेजा है। लॉगिन करने के लिए लिंक पर क्लिक करें।`
              : `We've sent a magic link to ${email}. Click the link to sign in.`}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setMagicLinkSent(false);
              handleMagicLink({ preventDefault: () => {} } as React.FormEvent);
            }}
            disabled={loading}
          >
            {language === "hi" ? "लिंक दोबारा भेजें" : "Resend link"}
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="email">
              {language === "hi" ? "ईमेल पता" : "Email Address"}
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailError(null);
              }}
              required
              className={`h-14 text-lg ${emailError ? 'border-destructive' : ''}`}
            />
            {emailError && (
              <p className="text-sm text-destructive">{emailError}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {language === "hi" 
                ? "हम आपको एक मैजिक लिंक भेजेंगे - कोई पासवर्ड नहीं चाहिए!"
                : "We'll send you a magic link - no password needed!"}
            </p>
          </div>

          <Button
            type="submit"
            className="w-full h-14 text-lg font-medium bg-gradient-to-r from-primary to-primary/90"
            disabled={loading || !email}
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <span className="flex items-center gap-2">
                {language === "hi" ? "मैजिक लिंक भेजें" : "Send Magic Link"}
                <Sparkles className="w-4 h-4" />
              </span>
            )}
          </Button>
        </>
      )}
    </form>
  );

  const renderResetPasswordMode = () => (
    <form onSubmit={handlePasswordReset} className="space-y-6">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mb-2"
        onClick={() => {
          setAuthMode("email");
          setResetSent(false);
        }}
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        {language === "hi" ? "वापस" : "Back"}
      </Button>

      {resetSent ? (
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
            <Mail className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-xl font-semibold">
            {language === "hi" ? "अपना ईमेल जांचें" : "Check your email"}
          </h3>
          <p className="text-muted-foreground text-sm">
            {language === "hi" 
              ? `हमने ${email} पर पासवर्ड रीसेट लिंक भेजा है।`
              : `We've sent a password reset link to ${email}.`}
          </p>
        </div>
      ) : (
        <>
          <div className="text-center mb-4">
            <h3 className="text-lg font-semibold">
              {language === "hi" ? "पासवर्ड रीसेट करें" : "Reset Password"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {language === "hi" 
                ? "अपना ईमेल दर्ज करें और हम आपको एक रीसेट लिंक भेजेंगे।"
                : "Enter your email and we'll send you a reset link."}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reset-email">
              {language === "hi" ? "ईमेल पता" : "Email Address"}
            </Label>
            <Input
              id="reset-email"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailError(null);
              }}
              required
              className={`h-12 ${emailError ? 'border-destructive' : ''}`}
            />
            {emailError && (
              <p className="text-sm text-destructive">{emailError}</p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full h-12 text-lg font-medium bg-gradient-to-r from-primary to-primary/90"
            disabled={loading || !email}
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <span className="flex items-center gap-2">
                {language === "hi" ? "रीसेट लिंक भेजें" : "Send Reset Link"}
                <ArrowRight className="w-4 h-4" />
              </span>
            )}
          </Button>
        </>
      )}
    </form>
  );

  const renderUpdatePasswordMode = () => (
    <form onSubmit={handleUpdatePassword} className="space-y-6">
      {recoverySessionStatus === "checking" && (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            {language === "hi" ? "रीसेट लिंक की पुष्टि हो रही है..." : "Verifying reset link..."}
          </p>
        </div>
      )}

      {recoverySessionStatus === "missing" && (
        <div className="space-y-4 text-center">
          <p className="text-sm text-destructive">
            {language === "hi"
              ? "यह पासवर्ड रीसेट लिंक अमान्य है या इसकी समय-सीमा समाप्त हो चुकी है। कृपया नया लिंक मांगें।"
              : "This password reset link is invalid or has expired. Please request a new link."}
          </p>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              setAuthMode("reset-password");
              navigate("/auth", { replace: true });
            }}
          >
            {language === "hi" ? "नया रीसेट लिंक मांगें" : "Request a new reset link"}
          </Button>
        </div>
      )}

      {recoverySessionStatus === "ready" && (
        <>
          <div className="space-y-2">
            <Label htmlFor="new-password">
              {language === "hi" ? "नया पासवर्ड" : "New Password"}
            </Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                setPasswordError(null);
              }}
              required
              className={`h-12 ${passwordError ? "border-destructive" : ""}`}
            />
            {passwordError && (
              <p className="text-sm text-destructive">{passwordError}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">
              {language === "hi" ? "नए पासवर्ड की पुष्टि करें" : "Confirm New Password"}
            </Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setConfirmPasswordError(null);
              }}
              required
              className={`h-12 ${confirmPasswordError ? "border-destructive" : ""}`}
            />
            {confirmPasswordError && (
              <p className="text-sm text-destructive">{confirmPasswordError}</p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full h-12 text-lg font-medium bg-gradient-to-r from-primary to-primary/90"
            disabled={loading || !newPassword || !confirmPassword}
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <span className="flex items-center gap-2">
                {language === "hi" ? "पासवर्ड बदलें" : "Update Password"}
                <ArrowRight className="w-4 h-4" />
              </span>
            )}
          </Button>
        </>
      )}
    </form>
  );

  const renderEmailMode = () => signUpConfirmationSent ? (
    <div className="space-y-6 text-center">
      <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
        <Mail className="w-8 h-8 text-primary" />
      </div>
      <div className="space-y-2">
        <h3 className="text-xl font-semibold">
          {language === "hi" ? "अपना ईमेल जांचें" : "Check your email"}
        </h3>
        <p className="text-sm text-muted-foreground">
          {language === "hi"
            ? `हमने ${email} पर पुष्टि लिंक भेजा है। लिंक खोलने के बाद Beat आपको अपने आप लॉगिन कर देगा।`
            : `We sent a confirmation link to ${email}. Open it and Beat will sign you in automatically.`}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => {
          setSignUpConfirmationSent(false);
          setIsLogin(true);
          setPassword("");
        }}
      >
        {language === "hi" ? "साइन इन पर वापस जाएं" : "Back to sign in"}
      </Button>
    </div>
  ) : (
    <form onSubmit={handleEmailAuth} className="space-y-6">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mb-2"
        onClick={() => setAuthMode("select")}
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        {language === "hi" ? "वापस" : "Back"}
      </Button>

      <div className="space-y-2">
        <Label htmlFor="email">
          {language === "hi" ? "ईमेल पता" : "Email Address"}
        </Label>
        <Input
          id="email"
          type="email"
          placeholder="name@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setEmailError(null);
          }}
          required
          className={`h-12 bg-white/50 dark:bg-black/20 border-border/50 ${emailError ? 'border-destructive' : ''}`}
        />
        {emailError && (
          <p className="text-sm text-destructive">{emailError}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">
          {language === "hi" ? "पासवर्ड" : "Password"}
        </Label>
        <Input
          id="password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setPasswordError(null);
          }}
          required
          className={`h-12 bg-white/50 dark:bg-black/20 border-border/50 ${passwordError ? 'border-destructive' : ''}`}
        />
        {passwordError && (
          <p className="text-sm text-destructive">{passwordError}</p>
        )}
      </div>

      {isLogin && (
        <div className="text-right">
          <button
            type="button"
            onClick={() => setAuthMode("reset-password")}
            className="text-sm text-primary hover:underline"
          >
            {language === "hi" ? "पासवर्ड भूल गए?" : "Forgot password?"}
          </button>
        </div>
      )}

      <Button
        className="w-full h-12 text-lg font-medium bg-gradient-to-r from-primary to-primary/90"
        disabled={loading || pendingPostAuthRedirect}
      >
        {loading || pendingPostAuthRedirect ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <span className="flex items-center gap-2">
            {isLogin 
              ? (language === "hi" ? "लॉगिन करें" : "Sign In")
              : (language === "hi" ? "खाता बनाएं" : "Create Account")}
            <ArrowRight className="w-4 h-4" />
          </span>
        )}
      </Button>

      <div className="text-center pt-2">
        <button
          type="button"
          onClick={() => setIsLogin(!isLogin)}
          className="text-sm text-muted-foreground hover:text-primary transition-colors hover:underline"
        >
          {isLogin 
            ? (language === "hi" ? "नए हैं? खाता बनाएं" : "New to Beat? Create an account")
            : (language === "hi" ? "पहले से खाता है? लॉगिन करें" : "Already have an account? Sign in")}
        </button>
      </div>
    </form>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative Background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,hsl(var(--primary)/0.05),transparent_70%)]"></div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center space-y-2 mb-8 animate-in slide-in-from-bottom-4 fade-in duration-700">
          <div className="inline-block p-5 rounded-full bg-black shadow-2xl mb-4">
            <Logo size="xl" showText={false} />
          </div>
          <h1 className="text-4xl font-serif font-bold tracking-tight">
            {authMode === "select" 
              ? (language === "hi" ? "बीट में आपका स्वागत है" : "Welcome to Beat")
              : authMode === "magic-link"
              ? (language === "hi" ? "मैजिक लिंक से लॉगिन" : "Magic Link Sign In")
              : authMode === "reset-password"
              ? (language === "hi" ? "पासवर्ड रीसेट" : "Reset Password")
              : authMode === "update-password"
              ? (language === "hi" ? "नया पासवर्ड बनाएं" : "Create New Password")
              : (isLogin 
                ? (language === "hi" ? "वापस स्वागत है" : "Welcome Back")
                : (language === "hi" ? "बीट से जुड़ें" : "Join Beat"))}
          </h1>
          <p className="text-muted-foreground">
            {language === "hi" 
              ? "आपकी दिल की सेहत की यात्रा यहां शुरू होती है"
              : "Your heart health journey starts here"}
          </p>
        </div>

        <Card className="p-8 glass-panel border-white/20 shadow-2xl animate-in slide-in-from-bottom-8 fade-in duration-700 delay-100">
          {authMode === "select" && renderSelectMode()}
          {authMode === "magic-link" && renderMagicLinkMode()}
          {authMode === "reset-password" && renderResetPasswordMode()}
          {authMode === "update-password" && renderUpdatePasswordMode()}
          {authMode === "email" && renderEmailMode()}
        </Card>
      </div>
    </div>
  );
};

export default Auth;
