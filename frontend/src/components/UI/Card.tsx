import React, { HTMLAttributes } from 'react';
import { cn } from '../../utils';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'outlined' | 'elevated';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const Card: React.FC<CardProps> = ({
  className,
  variant = 'default',
  padding = 'md',
  children,
  ...props
}) => {
  const variantClasses = {
    default: 'bg-surface border border-border dark:bg-surface dark:border-border',
    outlined: 'bg-surface border-2 border-border dark:bg-surface dark:border-border',
    elevated: 'bg-surface shadow-lg border border-border dark:bg-surface dark:border-border'
  };

  const paddingClasses = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6'
  };

  return (
    <div
      className={cn(
        'rounded-lg',
        variantClasses[variant],
        paddingClasses[padding],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

// Підкомпоненти для Card
interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export const CardHeader: React.FC<CardHeaderProps> = ({
  className,
  title,
  subtitle,
  action,
  children,
  ...props
}) => {
  return (
    <div
      className={cn(
        'flex items-center justify-between pb-3 border-b border-border dark:border-border',
        className
      )}
      {...props}
    >
      <div>
        {title && (
          <h3 className="text-lg font-semibold text-foreground dark:text-foreground">{title}</h3>
        )}
        {subtitle && (
          <p className="text-sm text-text-secondary dark:text-text-secondary">{subtitle}</p>
        )}
        {children}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
};

type CardContentProps = HTMLAttributes<HTMLDivElement>

export const CardContent: React.FC<CardContentProps> = ({
  className,
  children,
  ...props
}) => {
  return (
    <div className={cn('pt-3', className)} {...props}>
      {children}
    </div>
  );
};

type CardFooterProps = HTMLAttributes<HTMLDivElement>

export const CardFooter: React.FC<CardFooterProps> = ({
  className,
  children,
  ...props
}) => {
  return (
    <div
      className={cn(
        'pt-3 border-t border-border dark:border-border flex items-center justify-end space-x-2',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

type CardTitleProps = HTMLAttributes<HTMLHeadingElement>

export const CardTitle: React.FC<CardTitleProps> = ({
  className,
  children,
  ...props
}) => {
  return (
    <h3
      className={cn('text-lg font-semibold text-foreground dark:text-foreground', className)}
      {...props}
    >
      {children}
    </h3>
  );
};

export default Card;