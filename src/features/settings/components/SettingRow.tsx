import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Theme } from '@shared/ui/themes';

interface SettingRowProps {
  icon: string;
  iconFamily?: 'Ionicons' | 'MaterialCommunityIcons';
  label: string;
  theme: Theme;
  accentColor?: string;
  children: React.ReactNode;
}

export default function SettingRow({ icon, iconFamily = 'Ionicons', label, theme, accentColor, children }: SettingRowProps) {
  return (
    <View style={styles.container}>
      <View style={styles.leftSide}>
        {iconFamily === 'MaterialCommunityIcons' ? (
          <MaterialCommunityIcons name={icon as any} size={20} color={accentColor ?? theme.accent} />
        ) : (
          <Ionicons name={icon as any} size={20} color={accentColor ?? theme.accent} />
        )}
        <Text style={[styles.label, { color: theme.txt2 }]}>{label}</Text>
      </View>
      <View style={styles.rightSide}>
        {/* Forcefully wraps any naked strings or numbers that leak into the Row */}
        {React.Children.toArray(children).map((child, idx) => {
          if (typeof child === 'string' || typeof child === 'number') {
             return <Text key={idx} style={{ color: theme.txt1 }}>{child}</Text>;
          }
          return child;
        })}
      </View>
    </View>
  );
}

interface ToggleButtonProps {
  isActive?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  delayLongPress?: number;
  theme: Theme;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  activeOpacity?: number;
}

export function ToggleButton({
  isActive, onPress, onLongPress, delayLongPress, theme, children, style, textStyle, activeOpacity = 0.6
}: ToggleButtonProps) {
  return (
    <TouchableOpacity
      style={[
        styles.toggleBtn,
        { backgroundColor: theme.bg3, borderColor: theme.border },
        isActive && { backgroundColor: theme.accent, borderColor: theme.accent2 },
        style
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      activeOpacity={activeOpacity}
    >
      {/* Heavy-duty filter: flattens arrays, removes nulls, and wraps strings */}
      {React.Children.toArray(children).map((child, idx) => {
        if (typeof child === 'string' || typeof child === 'number') {
          return (
            <Text key={idx} style={[
              styles.toggleText,
              { color: isActive ? '#fff' : theme.txt3 },
              textStyle
            ]}>
              {child}
            </Text>
          );
        }
        return child;
      })}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  leftSide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 16, // Protective barrier so buttons never touch the label
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  rightSide: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap', // This is the magic fix! Wraps buttons to the next line.
    gap: 6,
    flex: 1, // Allows the right side to intelligently take up remaining space
  },
  toggleBtn: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleText: {
    fontWeight: '700',
    fontSize: 13,
  },
});