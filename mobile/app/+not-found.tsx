import { router } from 'expo-router';
import { Button, Page, ScreenIntro } from '../src/components';
export default function NotFound() {
  return (
    <Page title="GarantiyAid">
      <ScreenIntro
        iconName="alert"
        tone="amber"
        title="Screen not found"
        subtitle="This link is unavailable. Return to the app to continue."
      />
      <Button onPress={() => router.replace('/')}>Back to welcome</Button>
    </Page>
  );
}
