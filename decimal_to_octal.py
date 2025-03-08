#!/usr/bin/env python3
def decimal_to_octal(num):
    if num == 0:
        return "0"
    
    octal_digits = []
    while num > 0:
        remainder = num % 8
        octal_digits.append(str(remainder))
        num //= 8
    octal_digits.reverse()
    return ''.join(octal_digits)

def main():
    try:
        dec_number = int(input("Enter a decimal number: "))
        print("Octal representation:", decimal_to_octal(dec_number))
    except ValueError:
        print("Error: Please enter a valid integer.")

if __name__ == '__main__':
    main()
