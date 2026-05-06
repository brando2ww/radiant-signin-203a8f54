import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
  	container: {
  		center: true,
  		padding: '2rem',
  		screens: {
  			'2xl': '1400px'
  		}
  	},
  	extend: {
  		fontFamily: {
  			montserrat: ['Montserrat', 'system-ui', 'sans-serif'],
  		},
  		colors: {
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			success: {
  				DEFAULT: 'hsl(var(--success))',
  				foreground: 'hsl(var(--success-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			},
  			'fade-slide-in': {
  				from: {
  					opacity: '0',
  					filter: 'blur(4px)',
  					transform: 'translateY(20px)'
  				},
  				to: {
  					opacity: '1',
  					filter: 'blur(0px)',
  					transform: 'translateY(0px)'
  				}
  			},
  			'slide-right-in': {
  				from: {
  					opacity: '0',
  					filter: 'blur(4px)',
  					transform: 'translateX(-20px)'
  				},
  				to: {
  					opacity: '1',
  					filter: 'blur(0px)',
  					transform: 'translateX(0px)'
  				}
  			},
  			'testimonial-in': {
  				from: {
  					opacity: '0',
  					filter: 'blur(4px)',
  					transform: 'translateY(20px) scale(0.95)'
  				},
  				to: {
  					opacity: '1',
  					filter: 'blur(0px)',
  					transform: 'translateY(0px) scale(1)'
  				}
  			},
  			'pulse-ring': {
  				'0%': { transform: 'scale(1)', opacity: '0.55' },
  				'100%': { transform: 'scale(1.8)', opacity: '0' }
  			},
  			'check-draw': {
  				'0%': { transform: 'scale(0.4)', opacity: '0' },
  				'60%': { transform: 'scale(1.15)', opacity: '1' },
  				'100%': { transform: 'scale(1)', opacity: '1' }
  			},
  			'fill-down': {
  				'0%': { transform: 'translateY(-100%)' },
  				'100%': { transform: 'translateY(100%)' }
  			},
  			'timeline-in': {
  				from: { opacity: '0', transform: 'translateY(8px)' },
  				to: { opacity: '1', transform: 'translateY(0)' }
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
  			'pulse-ring': 'pulse-ring 2s ease-out infinite',
  			'check-draw': 'check-draw 500ms cubic-bezier(0.34, 1.56, 0.64, 1) both',
  			'fill-down': 'fill-down 2s linear infinite',
  			'spin-slow': 'spin 3s linear infinite',
  			'timeline-in': 'timeline-in 400ms ease-out both'
  		},
  		animationDelay: {
  			'100': '100ms',
  			'200': '200ms',
  			'300': '300ms',
  			'400': '400ms',
  			'500': '500ms',
  			'600': '600ms',
  			'700': '700ms',
  			'800': '800ms',
  			'900': '900ms',
  			'1000': '1000ms',
  			'1200': '1200ms',
  			'1400': '1400ms'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
