export const getIo = jest.fn().mockReturnValue({
  to: jest.fn().mockReturnThis(),
  emit: jest.fn(),
});

export const setIo = jest.fn();
