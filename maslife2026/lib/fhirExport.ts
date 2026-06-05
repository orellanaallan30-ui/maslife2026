import { Patient, ProfessionalProfile } from '../types';

export function generateFhirR4Bundle(patient: Patient, professional: ProfessionalProfile): string {
  const now = new Date().toISOString();
  const nameParts = patient.name.trim().split(' ');
  const family = nameParts.pop() || patient.name;
  const given = nameParts.length > 0 ? nameParts : undefined;

  const soap = (patient.soap as Record<string, string>) || {};

  const soapSection = (title: string, key: string) =>
    soap[key]?.trim()
      ? {
          title,
          text: {
            status: 'generated',
            div: `<div xmlns="http://www.w3.org/1999/xhtml">${soap[key].replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`,
          },
        }
      : null;

  const bundle = {
    resourceType: 'Bundle',
    id: `maslife-${patient.id}`,
    meta: {
      lastUpdated: now,
      profile: ['http://hl7.org/fhir/StructureDefinition/Bundle'],
    },
    type: 'document',
    timestamp: now,
    entry: [
      {
        fullUrl: `urn:uuid:patient-${patient.id}`,
        resource: {
          resourceType: 'Patient',
          id: patient.id,
          identifier: patient.rut
            ? [{ system: 'urn:oid:2.16.152.1.1', value: patient.rut, use: 'official' }]
            : undefined,
          name: [{ use: 'official', family, given }],
          birthDate: patient.birthDate || undefined,
          gender:
            patient.gender?.toLowerCase().includes('mascul')
              ? 'male'
              : patient.gender?.toLowerCase().includes('femen')
              ? 'female'
              : 'unknown',
          telecom: [
            patient.phone ? { system: 'phone', value: patient.phone, use: 'mobile' } : null,
            patient.email ? { system: 'email', value: patient.email } : null,
          ].filter(Boolean),
          address: patient.address ? [{ use: 'home', text: patient.address, country: 'CL' }] : undefined,
        },
      },
      {
        fullUrl: `urn:uuid:practitioner-${professional.id}`,
        resource: {
          resourceType: 'Practitioner',
          id: professional.id,
          name: [{ use: 'official', text: professional.name }],
          qualification: [
            {
              code: {
                coding: [{ system: 'http://snomed.info/sct', display: professional.specialty }],
                text: professional.specialty,
              },
            },
          ],
        },
      },
      {
        fullUrl: `urn:uuid:composition-${patient.id}`,
        resource: {
          resourceType: 'Composition',
          id: `comp-${patient.id}`,
          status: 'final',
          type: {
            coding: [{ system: 'http://loinc.org', code: '34133-9', display: 'Summary of episode note' }],
          },
          subject: { reference: `urn:uuid:patient-${patient.id}` },
          author: [{ reference: `urn:uuid:practitioner-${professional.id}` }],
          title: 'Historia Clínica — Clínica Mas Life',
          date: now,
          custodian: { display: 'Clínica Mas Life — clinicamaslife.cl' },
          section: [
            soapSection('Subjetivo (S)', 'subjective'),
            soapSection('Objetivo (O)', 'objective'),
            soapSection('Evaluación (A)', 'assessment'),
            soapSection('Plan (P)', 'plan'),
            patient.medicalHistory?.trim()
              ? {
                  title: 'Antecedentes',
                  text: {
                    status: 'generated',
                    div: `<div xmlns="http://www.w3.org/1999/xhtml">${patient.medicalHistory.replace(/</g, '&lt;')}</div>`,
                  },
                }
              : null,
            patient.allergies?.length
              ? {
                  title: 'Alergias',
                  text: {
                    status: 'generated',
                    div: `<div xmlns="http://www.w3.org/1999/xhtml">${patient.allergies.join(', ')}</div>`,
                  },
                }
              : null,
            patient.diagnoses?.trim()
              ? {
                  title: 'Diagnóstico',
                  text: {
                    status: 'generated',
                    div: `<div xmlns="http://www.w3.org/1999/xhtml">${patient.diagnoses.replace(/</g, '&lt;')}</div>`,
                  },
                }
              : null,
          ].filter(Boolean),
        },
      },
    ],
  };

  return JSON.stringify(bundle, null, 2);
}

export function downloadFhirBundle(patient: Patient, professional: ProfessionalProfile): void {
  const json = generateFhirR4Bundle(patient, professional);
  const blob = new Blob([json], { type: 'application/fhir+json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fhir_${(patient.rut || patient.id).replace(/[^a-zA-Z0-9-]/g, '')}_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
