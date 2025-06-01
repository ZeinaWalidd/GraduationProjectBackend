import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import Store from '../components/Store';
import Cart from '../components/Cart';

const Stack = createStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen 
          name="Store" 
          component={Store}
          options={{
            title: 'Store',
            headerShown: true
          }}
        />
        <Stack.Screen 
          name="Cart" 
          component={Cart}
          options={{
            title: 'Shopping Cart',
            headerShown: true
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
} 