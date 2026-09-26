import { describe, it, expect } from 'vitest';
import { modalidadesDelPro, modalidadesDeServicio, claveDeTipo } from '../../api/_lib/modalidades';

const pro = { inPerson: true, home: true, online: false };

describe('modalidad por servicio', () => {
  it('un servicio sin lista propia se ofrece en todas las modalidades del profesional', () => {
    expect(modalidadesDeServicio(pro, undefined)).toEqual(['inPerson', 'home']);
    expect(modalidadesDeServicio(pro, [])).toEqual(['inPerson', 'home']);
  });

  it('la lista del servicio se limita a lo que el profesional tiene activo', () => {
    expect(modalidadesDeServicio(pro, ['home'])).toEqual(['home']);
    expect(modalidadesDeServicio(pro, ['home', 'online'])).toEqual(['home']);
  });

  it('si el profesional desactivó todas las del servicio, no queda imposible de reservar', () => {
    expect(modalidadesDeServicio(pro, ['online'])).toEqual(['inPerson', 'home']);
  });

  it('un profesional sin modalidades activas queda en presencial (default histórico)', () => {
    expect(modalidadesDelPro({ inPerson: false, home: false, online: false })).toEqual(['inPerson']);
    expect(modalidadesDelPro(undefined)).toEqual(['inPerson']);
  });

  it('traduce el tipo de cita a la clave de modalidad', () => {
    expect(claveDeTipo('Domicilio')).toBe('home');
    expect(claveDeTipo('Online')).toBe('online');
    expect(claveDeTipo('Presencial')).toBe('inPerson');
  });
});
