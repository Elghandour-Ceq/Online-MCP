import React, { useState, useEffect } from 'react';

// Props interface
interface UserProps {
  name: string;
  age: number;
}

// Component state interface
interface UserState {
  isActive: boolean;
}

// Function component with hooks
export function UserProfile({ name, age }: UserProps) {
  const [isActive, setIsActive] = useState(false);
  
  useEffect(() => {
    console.log('Component mounted');
  }, []);

  return <div>{name}</div>;
}

// Class component with state
export class UserSettings extends React.Component<UserProps, UserState> {
  constructor(props: UserProps) {
    super(props);
    this.state = {
      isActive: false
    };
  }

  handleClick = () => {
    this.setState({ isActive: !this.state.isActive });
  };

  render() {
    return <div onClick={this.handleClick}>{this.props.name}</div>;
  }
}

// Arrow function component
export const UserList = () => {
  return <div>User List</div>;
};

// HOC (Higher Order Component)
function withUser<T extends UserProps>(WrappedComponent: React.ComponentType<T>) {
  return class WithUser extends React.Component<T> {
    render() {
      return <WrappedComponent {...this.props} />;
    }
  };
}

// Memo component
export const MemoizedUser = React.memo(function User({ name }: UserProps) {
  return <div>{name}</div>;
});

// Forwarded ref component
export const ForwardedButton = React.forwardRef<HTMLButtonElement, { label: string }>(
  (props, ref) => (
    <button ref={ref}>{props.label}</button>
  )
);

// Custom hook
function useUser(userId: string) {
  const [user, setUser] = useState<UserProps | null>(null);
  
  useEffect(() => {
    // Fetch user
  }, [userId]);
  
  return user;
}

// Context provider component
export const UserContext = React.createContext<UserProps | null>(null);

export class UserProvider extends React.Component<{ children: React.ReactNode }> {
  render() {
    return (
      <UserContext.Provider value={{ name: 'John', age: 30 }}>
        {this.props.children}
      </UserContext.Provider>
    );
  }
}
