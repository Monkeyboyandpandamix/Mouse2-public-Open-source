#!/usr/bin/env python3
"""
Servo Control Script for Raspberry Pi
Allows precise control of servo position with configurable min/max limits
Can be called from the Ground Control Station via API
"""

import time
import sys
import json
import argparse

# Try to use pigpio first (doesn't require sudo), fall back to RPi.GPIO
USE_PIGPIO = False

try:
    import pigpio
    USE_PIGPIO = True
except ImportError:
    try:
        import RPi.GPIO as GPIO
    except ImportError:
        print(json.dumps({"error": "No GPIO library available. Install pigpio or RPi.GPIO"}))
        sys.exit(1)
    except RuntimeError as e:
        print(json.dumps({"error": "GPIO access denied. Run setup script or use sudo"}))
        sys.exit(1)

# Configuration
SERVO_PIN = 4          # GPIO 4 (BCM numbering)
MIN_DUTY = 2.5         # Duty cycle for fully closed position (0 degrees)
MAX_DUTY = 12.5        # Duty cycle for fully open position (180 degrees)
PWM_FREQUENCY = 50     # Standard servo frequency (50Hz)

# For pigpio: pulse width in microseconds
MIN_PULSE_WIDTH = 500   # 0 degrees
MAX_PULSE_WIDTH = 2500  # 180 degrees

pi = None
pwm = None

def setup_servo():
    """Initialize GPIO and PWM for servo control"""
    global pi, pwm
    
    if USE_PIGPIO:
        pi = pigpio.pi()
        if not pi.connected:
            raise Exception("Could not connect to pigpio daemon. Run: sudo pigpiod")
        pi.set_mode(SERVO_PIN, pigpio.OUTPUT)
        return pi
    else:
        GPIO.setwarnings(False)
        GPIO.setmode(GPIO.BCM)
        GPIO.setup(SERVO_PIN, GPIO.OUT)
        pwm = GPIO.PWM(SERVO_PIN, PWM_FREQUENCY)
        pwm.start(0)
        return pwm

def set_angle(angle):
    """
    Set servo to specific angle
    angle: 0 (closed) to 180 (open)
    """
    global pi, pwm
    
    if angle < 0:
        angle = 0
    elif angle > 180:
        angle = 180
    
    if USE_PIGPIO:
        pulse_width = MIN_PULSE_WIDTH + (angle / 180.0) * (MAX_PULSE_WIDTH - MIN_PULSE_WIDTH)
        pi.set_servo_pulsewidth(SERVO_PIN, int(pulse_width))
        time.sleep(0.3)
        pi.set_servo_pulsewidth(SERVO_PIN, 0)  # Stop signal to prevent jitter
    else:
        duty = MIN_DUTY + (angle / 180.0) * (MAX_DUTY - MIN_DUTY)
        pwm.ChangeDutyCycle(duty)
        time.sleep(0.3)
        pwm.ChangeDutyCycle(0)

def cleanup():
    """Clean up GPIO resources"""
    global pi, pwm
    
    if USE_PIGPIO and pi:
        pi.set_servo_pulsewidth(SERVO_PIN, 0)
        pi.stop()
    elif pwm:
        pwm.stop()
        GPIO.cleanup()

def main():
    parser = argparse.ArgumentParser(description='Control servo from command line')
    parser.add_argument('action', choices=['open', 'close', 'angle', 'status'],
                       help='Action to perform')
    parser.add_argument('--value', type=int, default=None,
                       help='Angle value (0-180) for angle action')
    parser.add_argument('--json', action='store_true',
                       help='Output in JSON format')
    
    args = parser.parse_args()
    
    try:
        setup_servo()
        
        result = {"success": True, "action": args.action}
        
        if args.action == 'open':
            set_angle(180)
            result["angle"] = 180
            result["message"] = "Gripper opened"
        elif args.action == 'close':
            set_angle(0)
            result["angle"] = 0
            result["message"] = "Gripper closed"
        elif args.action == 'angle':
            if args.value is None:
                result = {"success": False, "error": "Angle value required (--value)"}
            else:
                set_angle(args.value)
                result["angle"] = args.value
                result["message"] = f"Gripper set to {args.value} degrees"
        elif args.action == 'status':
            result["gpio_library"] = "pigpio" if USE_PIGPIO else "RPi.GPIO"
            result["gpio_pin"] = SERVO_PIN
            result["message"] = "Servo controller ready"
        
        if args.json:
            print(json.dumps(result))
        else:
            print(result.get("message", str(result)))
            
    except Exception as e:
        error_result = {"success": False, "error": str(e)}
        if args.json:
            print(json.dumps(error_result))
        else:
            print(f"Error: {e}")
        sys.exit(1)
    finally:
        cleanup()

if __name__ == "__main__":
    main()
