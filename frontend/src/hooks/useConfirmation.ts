import { useState, useCallback } from 'react';

export interface ConfirmationOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
  icon?: React.ReactNode;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}

export interface ConfirmationState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
  icon?: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export const useConfirmation = () => {
  const [state, setState] = useState<ConfirmationState>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Підтвердити',
    cancelText: 'Скасувати',
    type: 'danger',
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    onConfirm: () => {},
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    onCancel: () => {}
  });

  const showConfirmation = useCallback((options: ConfirmationOptions) => {
    setState({
      isOpen: true,
      title: options.title,
      message: options.message,
      confirmText: options.confirmText || 'Підтвердити',
      cancelText: options.cancelText || 'Скасувати',
      type: options.type || 'danger',
      icon: options.icon,
      onConfirm: options.onConfirm,
      onCancel: options.onCancel
    });
  }, []);

  const hideConfirmation = useCallback(() => {
    setState(prev => ({ ...prev, isOpen: false }));
  }, []);

  return {
    confirmationState: state,
    showConfirmation,
    hideConfirmation
  };
};