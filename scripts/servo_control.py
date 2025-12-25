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

# Configuration - ADJUST THESE FOR YOUR SERVO
SERVO_PIN = 4          # GPIO 4 (BCM numbering)
PWM_FREQUENCY = 50     # Standard servo frequency (50Hz)

# For RPi.GPIO: duty cycle percentages
MIN_DUTY = 2.5         # Duty cycle for fully closed position
MAX_DUTY = 12.5        # Duty cycle for fully open position

# For pigpio: pulse width in microseconds (more precise)
# Standard servo range is 500-2500us, but you can adjust for tighter grip
MIN_PULSE_WIDTH = 500   # Closed position - decrease for tighter grip
MAX_PULSE_WIDTH = 2500  # Open position

# Gripper-specific settings
CLOSE_ANGLE = 0        # Angle for closed grip (0-180)
OPEN_ANGLE = 180       # Angle for open grip (0-180)
HOLD_TIME = 0.5        # Time to hold position before stopping PWM
PULSE_COUNT = 3        # Number of pulses to send for reliable positioning

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

def set_angle(angle, hold_time=None, pulses=1):
    """
    Set servo to specific angle with configurable hold time and pulse count
    angle: 0 (closed) to 180 (open)
    hold_time: how long to hold position (None = use default HOLD_TIME)
    pulses: number of times to send the position command for reliability
    """
    global pi, pwm
    
    if angle < 0:
        angle = 0
    elif angle > 180:
        angle = 180
    
    actual_hold = hold_time if hold_time is not None else HOLD_TIME
    
    if USE_PIGPIO:
        pulse_width = MIN_PULSE_WIDTH + (angle / 180.0) * (MAX_PULSE_WIDTH - MIN_PULSE_WIDTH)
        for i in range(pulses):
            pi.set_servo_pulsewidth(SERVO_PIN, int(pulse_width))
            time.sleep(actual_hold)
        pi.set_servo_pulsewidth(SERVO_PIN, 0)  # Stop signal to prevent jitter
    else:
        duty = MIN_DUTY + (angle / 180.0) * (MAX_DUTY - MIN_DUTY)
        for i in range(pulses):
            pwm.ChangeDutyCycle(duty)
            time.sleep(actual_hold)
        pwm.ChangeDutyCycle(0)

def grip_tight():
    """
    Close gripper with extra force for secure grip
    Sends multiple pulses and holds longer to ensure tight closure
    """
    set_angle(CLOSE_ANGLE, hold_time=0.8, pulses=PULSE_COUNT)

def grip_release():
    """
    Open gripper fully
    """
    set_angle(OPEN_ANGLE, hold_time=HOLD_TIME, pulses=2)

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
    parser.add_argument('--tight', action='store_true',
                       help='Use tight grip mode for close action')
    parser.add_argument('--hold', type=float, default=None,
                       help='Custom hold time in seconds')
    parser.add_argument('--json', action='store_true',
                       help='Output in JSON format')
    
    args = parser.parse_args()
    
    try:
        setup_servo()
        
        result = {"success": True, "action": args.action}
        
        if args.action == 'open':
            grip_release()
            result["angle"] = OPEN_ANGLE
            result["message"] = "Gripper opened"
        elif args.action == 'close':
            if args.tight:
                grip_tight()
                result["message"] = "Gripper closed (tight grip)"
            else:
                grip_tight()  # Always use tight grip for better reliability
                result["message"] = "Gripper closed"
            result["angle"] = CLOSE_ANGLE
        elif args.action == 'angle':
            if args.value is None:
                result = {"success": False, "error": "Angle value required (--value)"}
            else:
                hold = args.hold if args.hold else HOLD_TIME
                set_angle(args.value, hold_time=hold, pulses=2)
                result["angle"] = args.value
                result["message"] = f"Gripper set to {args.value} degrees"
        elif args.action == 'status':
            result["gpio_library"] = "pigpio" if USE_PIGPIO else "RPi.GPIO"
            result["gpio_pin"] = SERVO_PIN
            result["close_angle"] = CLOSE_ANGLE
            result["open_angle"] = OPEN_ANGLE
            result["min_pulse"] = MIN_PULSE_WIDTH
            result["max_pulse"] = MAX_PULSE_WIDTH
            result["hold_time"] = HOLD_TIME
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
