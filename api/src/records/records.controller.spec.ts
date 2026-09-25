import { RecordsController } from './records.controller';
import type { RecordsService } from './records.service';

/** The guards are the auth module's, tested there; here the controller is only the hand-over. */
describe('RecordsController', () => {
  const service = { deleteRows: vi.fn(), wipe: vi.fn() };
  const controller = new RecordsController(service as unknown as RecordsService);

  it('hands a row deletion to the service with the site and the body', async () => {
    service.deleteRows.mockResolvedValueOnce({ deletedEvents: 2 });
    const dto = { table: 'page' as const, key: '/es', from: '2029-04-01', to: '2029-04-02' };
    await expect(controller.deleteRows('take', dto)).resolves.toEqual({ deletedEvents: 2 });
    expect(service.deleteRows).toHaveBeenCalledWith('take', dto);
  });

  it('hands a wipe to the service', async () => {
    service.wipe.mockResolvedValueOnce({ events: 5 });
    await expect(controller.wipe('take')).resolves.toEqual({ events: 5 });
    expect(service.wipe).toHaveBeenCalledWith('take');
  });
});
