import { Alert, Platform, type AlertButton } from 'react-native';

/**
 * Alert.alert из React Native в браузере ничего не показывает,
 * поэтому на вебе используем системные alert/confirm.
 */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]) {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }
  const text = [title, message].filter(Boolean).join('\n\n');
  if (!buttons || buttons.length <= 1) {
    window.alert(text);
    buttons?.[0]?.onPress?.();
    return;
  }
  const cancel = buttons.find((b) => b.style === 'cancel');
  const action = buttons.filter((b) => b !== cancel).at(-1);
  if (window.confirm(text)) action?.onPress?.();
  else cancel?.onPress?.();
}
