import React, { useRef, useState, useEffect } from 'react';
import { View, StyleSheet, Animated, TouchableWithoutFeedback, Dimensions } from 'react-native';

export const PopUpModal = ({ visible, onClose, children }: { visible: boolean, onClose: () => void, children: React.ReactNode }) => {
  const [show, setShow] = useState(visible);
  const anim = useRef(new Animated.Value(0)).current;

  // 1. Handle Unmounting / Exiting
  useEffect(() => {
    if (visible) {
      setShow(true); // Trigger mount first
    } else {
      Animated.timing(anim, { 
        toValue: 0, 
        duration: 150, 
        useNativeDriver: true 
      }).start(({ finished }) => {
        if (finished) setShow(false);
      });
    }
  }, [visible]);

  // 2. Handle Entrance only AFTER it has mounted
  useEffect(() => {
    if (show && visible) {
      Animated.timing(anim, { 
        toValue: 1, 
        duration: 200, 
        useNativeDriver: true 
      }).start();
    }
  }, [show, visible]);

  if (!show) return null;
  return (
    // Removed the buggy elevation: 10 from this wrapper!
    <View style={[StyleSheet.absoluteFill, { zIndex: 1000 }]}>
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)', opacity: anim }]} />
      </TouchableWithoutFeedback>
      <Animated.View 
  pointerEvents="box-none" 
  needsOffscreenAlphaCompositing={true} // <-- Add this to fix the dark shadow glitch
  style={{ 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    padding: 20, 
    opacity: anim, 
    transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }] 
  }}
>
  {children}
</Animated.View>
    </View>
  );
};

export const SlideUpModal = ({ visible, onClose, children }: { visible: boolean, onClose: () => void, children: React.ReactNode }) => {
  const [show, setShow] = useState(visible);
  const anim = useRef(new Animated.Value(0)).current;
  const screenHeight = Dimensions.get('window').height;

  // 1. Handle Unmounting / Exiting
  useEffect(() => {
    if (visible) {
      setShow(true); 
    } else {
      Animated.timing(anim, { 
        toValue: 0, 
        duration: 200, 
        useNativeDriver: true 
      }).start(({ finished }) => {
        if (finished) setShow(false);
      });
    }
  }, [visible]);

  // 2. Handle Entrance only AFTER it has mounted
  useEffect(() => {
    if (show && visible) {
      Animated.spring(anim, { toValue: 1, damping: 25, stiffness: 120, useNativeDriver: true }).start();
    }
  }, [show, visible]);

  if (!show) return null;
  return (
    // Removed the buggy elevation: 10 from this wrapper!
    <View style={[StyleSheet.absoluteFill, { zIndex: 1000 }]}>
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)', opacity: anim }]} />
      </TouchableWithoutFeedback>
      <Animated.View pointerEvents="box-none" style={{ flex: 1, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [screenHeight, 0] }) }] }}>
        {children}
      </Animated.View>
    </View>
  );
};