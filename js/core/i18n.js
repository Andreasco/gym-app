// Italian labels for exercise database values.
export const IT = {
  muscles: {
    abdominals: 'Addominali', abductors: 'Abduttori', adductors: 'Adduttori', biceps: 'Bicipiti',
    calves: 'Polpacci', chest: 'Petto', forearms: 'Avambracci', glutes: 'Glutei',
    hamstrings: 'Femorali', lats: 'Dorsali', 'lower back': 'Lombari', 'middle back': 'Dorso medio',
    neck: 'Collo', quadriceps: 'Quadricipiti', shoulders: 'Spalle', traps: 'Trapezio', triceps: 'Tricipiti',
  },
  equipment: {
    bands: 'Elastici', barbell: 'Bilanciere', 'body only': 'Corpo libero', cable: 'Cavi',
    dumbbell: 'Manubri', 'e-z curl bar': 'Bilanciere EZ', 'exercise ball': 'Fitball',
    'foam roll': 'Foam roller', kettlebells: 'Kettlebell', machine: 'Macchina',
    'medicine ball': 'Palla medica', other: 'Altro',
  },
  level: { beginner: 'Principiante', intermediate: 'Intermedio', expert: 'Avanzato' },
};

export const tr = (group, key) => (key && IT[group][key]) || key || '—';
