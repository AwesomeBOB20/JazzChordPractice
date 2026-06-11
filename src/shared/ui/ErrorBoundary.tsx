import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }
  componentDidCatch(error: any, info: any) {
    console.log('CRASH COMPONENT STACK:', info.componentStack);
  }
  static getDerivedStateFromError(error: any) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, backgroundColor: '#1A1816', justifyContent: 'center', alignItems: 'center', padding: 32 }}>
          <MaterialCommunityIcons name="alert-circle-outline" size={64} color="#D85A30" style={{ marginBottom: 16 }} />
          <Text style={{ color: '#E8E2D9', fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 8 }}>Something went wrong</Text>
          <Text style={{ color: '#807868', fontSize: 14, textAlign: 'center', marginBottom: 32 }}>The app encountered an unexpected error. Please try restarting.</Text>
          <TouchableOpacity 
            style={{ backgroundColor: '#D85A30', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 16 }}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); this.setState({ error: null }); }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Reload App</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}