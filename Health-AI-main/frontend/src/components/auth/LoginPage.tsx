import React from 'react';
import { SignInPage } from './SignInPage';

export interface LoginPageProps {
  onSuccess: () => void;
  onBackToHome: () => void;
  onNavigateSignUp?: () => void;
  initialEmail?: string;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onSuccess,
  onBackToHome,
  onNavigateSignUp,
  initialEmail,
}) => {
  return (
    <SignInPage
      onSuccess={onSuccess}
      onNavigateHome={onBackToHome}
      initialEmail={initialEmail}
      onNavigateSignUp={
        onNavigateSignUp ||
        (() => {
          window.history.pushState({}, '', '/signup');
          window.dispatchEvent(new PopStateEvent('popstate'));
        })
      }
    />
  );
};

export { SignInPage };
