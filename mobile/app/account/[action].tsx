import { useLocalSearchParams } from 'expo-router';
import { ChangePasswordScreen, EmailScreen, ForgotPasswordScreen } from '../../src/screens/account';
import { LoginScreen } from '../../src/screens/login';
import NotFound from '../+not-found';

export default function AccountAction() {
  const { action } = useLocalSearchParams<{ action: string }>();
  if (action === 'password-login') return <LoginScreen />;
  if (action === 'password') return <ChangePasswordScreen />;
  if (action === 'forgot-password') return <ForgotPasswordScreen />;
  if (action === 'email') return <EmailScreen />;
  return <NotFound />;
}
