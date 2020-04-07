const HTTP_STATUS = require('http-status-codes');

const {
    schema: {
        schema: {
            Vocabulary, User, UserGroup, Source,
        },
    },
} = require('@bcgsc/knowledgebase-schema');

const { checkClassPermissions } = require('../../src/middleware/auth');
const { generateDefaultGroups } = require('../../src/repo/schema');

describe('checkClassPermissions', () => {
    // get the usergroups from the db to start (default groups)
    const groups = {};

    for (const group of generateDefaultGroups()) {
        groups[group.name] = group;
    }
    const next = jest.fn();
    const res = { status: jest.fn().mockReturnValue({ json: jest.fn() }) };
    let req;

    beforeEach(() => {
        req = {};
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('users', () => {
        beforeEach(() => {
            req = { model: User };
        });

        describe('create', () => {
            beforeEach(() => {
                req.method = 'POST';
            });

            test('admin calls next', () => {
                req.user = { groups: [groups.admin] };
                checkClassPermissions(req, res, next);
                expect(next).toHaveBeenCalled();
            });

            test('manager throws error', () => {
                req.user = { groups: [groups.manager] };
                checkClassPermissions(req, res, next);
                expect(next).not.toHaveBeenCalled();
                expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
            });

            test('regular throws error', () => {
                req.user = { groups: [groups.regular] };
                checkClassPermissions(req, res, next);
                expect(next).not.toHaveBeenCalled();
                expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
            });

            test('readonly throws error', () => {
                req.user = { groups: [groups.readonly] };
                checkClassPermissions(req, res, next);
                expect(next).not.toHaveBeenCalled();
                expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
            });
        });

        describe('read', () => {
            beforeEach(() => {
                req.method = 'GET';
            });

            test('admin calls next', () => {
                req.user = { groups: [groups.admin] };
                checkClassPermissions(req, res, next);
                expect(next).toHaveBeenCalled();
            });

            test('manager calls next', () => {
                req.user = { groups: [groups.manager] };
                checkClassPermissions(req, res, next);
                expect(next).toHaveBeenCalled();
            });

            test('regular calls next', () => {
                req.user = { groups: [groups.regular] };
                checkClassPermissions(req, res, next);
                expect(next).toHaveBeenCalled();
            });

            test('readonly calls next', () => {
                req.user = { groups: [groups.readonly] };
                checkClassPermissions(req, res, next);
                expect(next).toHaveBeenCalled();
            });
        });

        describe('update', () => {
            beforeEach(() => {
                req.method = 'PATCH';
            });

            test('admin calls next', () => {
                req.user = { groups: [groups.admin] };
                checkClassPermissions(req, res, next);
                expect(next).toHaveBeenCalled();
            });

            test('manager throws error', () => {
                req.user = { groups: [groups.manager] };
                checkClassPermissions(req, res, next);
                expect(next).not.toHaveBeenCalled();
                expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
            });

            test('regular throws error', () => {
                req.user = { groups: [groups.regular] };
                checkClassPermissions(req, res, next);
                expect(next).not.toHaveBeenCalled();
                expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
            });

            test('readonly throws error', () => {
                req.user = { groups: [groups.readonly] };
                checkClassPermissions(req, res, next);
                expect(next).not.toHaveBeenCalled();
                expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
            });
        });

        describe('delete', () => {
            beforeEach(() => {
                req.method = 'DELETE';
            });

            test('admin calls next', () => {
                req.user = { groups: [groups.admin] };
                checkClassPermissions(req, res, next);
                expect(next).toHaveBeenCalled();
            });

            test('manager throws error', () => {
                req.user = { groups: [groups.manager] };
                checkClassPermissions(req, res, next);
                expect(next).not.toHaveBeenCalled();
                expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
            });

            test('regular throws error', () => {
                req.user = { groups: [groups.regular] };
                checkClassPermissions(req, res, next);
                expect(next).not.toHaveBeenCalled();
                expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
            });

            test('readonly throws error', () => {
                req.user = { groups: [groups.readonly] };
                checkClassPermissions(req, res, next);
                expect(next).not.toHaveBeenCalled();
                expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
            });
        });
    });

    describe('usergroups', () => {
        beforeEach(() => {
            req = { model: UserGroup };
        });

        describe('create', () => {
            beforeEach(() => {
                req.method = 'POST';
            });

            test('admin calls next', () => {
                req.user = { groups: [groups.admin] };
                checkClassPermissions(req, res, next);
                expect(next).toHaveBeenCalled();
            });

            test('manager throws error', () => {
                req.user = { groups: [groups.manager] };
                checkClassPermissions(req, res, next);
                expect(next).not.toHaveBeenCalled();
                expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
            });

            test('regular throws error', () => {
                req.user = { groups: [groups.regular] };
                checkClassPermissions(req, res, next);
                expect(next).not.toHaveBeenCalled();
                expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
            });

            test('readonly throws error', () => {
                req.user = { groups: [groups.readonly] };
                checkClassPermissions(req, res, next);
                expect(next).not.toHaveBeenCalled();
                expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
            });
        });

        describe('read', () => {
            beforeEach(() => {
                req.method = 'GET';
            });

            test('admin calls next', () => {
                req.user = { groups: [groups.admin] };
                checkClassPermissions(req, res, next);
                expect(next).toHaveBeenCalled();
            });

            test('manager calls next', () => {
                req.user = { groups: [groups.manager] };
                checkClassPermissions(req, res, next);
                expect(next).toHaveBeenCalled();
            });

            test('regular calls next', () => {
                req.user = { groups: [groups.regular] };
                checkClassPermissions(req, res, next);
                expect(next).toHaveBeenCalled();
            });

            test('readonly calls next', () => {
                req.user = { groups: [groups.readonly] };
                checkClassPermissions(req, res, next);
                expect(next).toHaveBeenCalled();
            });
        });

        describe('update', () => {
            beforeEach(() => {
                req.method = 'PATCH';
            });

            test('admin calls next', () => {
                req.user = { groups: [groups.admin] };
                checkClassPermissions(req, res, next);
                expect(next).toHaveBeenCalled();
            });

            test('manager throws error', () => {
                req.user = { groups: [groups.manager] };
                checkClassPermissions(req, res, next);
                expect(next).not.toHaveBeenCalled();
                expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
            });

            test('regular throws error', () => {
                req.user = { groups: [groups.regular] };
                checkClassPermissions(req, res, next);
                expect(next).not.toHaveBeenCalled();
                expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
            });

            test('readonly throws error', () => {
                req.user = { groups: [groups.readonly] };
                checkClassPermissions(req, res, next);
                expect(next).not.toHaveBeenCalled();
                expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
            });
        });

        describe('delete', () => {
            beforeEach(() => {
                req.method = 'DELETE';
            });

            test('admin calls next', () => {
                req.user = { groups: [groups.admin] };
                checkClassPermissions(req, res, next);
                expect(next).toHaveBeenCalled();
            });

            test('manager throws error', () => {
                req.user = { groups: [groups.manager] };
                checkClassPermissions(req, res, next);
                expect(next).not.toHaveBeenCalled();
                expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
            });

            test('regular throws error', () => {
                req.user = { groups: [groups.regular] };
                checkClassPermissions(req, res, next);
                expect(next).not.toHaveBeenCalled();
                expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
            });

            test('readonly throws error', () => {
                req.user = { groups: [groups.readonly] };
                checkClassPermissions(req, res, next);
                expect(next).not.toHaveBeenCalled();
                expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
            });
        });
    });

    describe('vocabulary', () => {
        beforeEach(() => {
            req = { model: Vocabulary };
        });

        describe('create', () => {
            beforeEach(() => {
                req.method = 'POST';
            });

            test('admin calls next', () => {
                req.user = { groups: [groups.admin] };
                checkClassPermissions(req, res, next);
                expect(next).toHaveBeenCalled();
            });

            test('manager calls next', () => {
                req.user = { groups: [groups.manager] };
                checkClassPermissions(req, res, next);
                expect(next).toHaveBeenCalled();
            });

            test('regular throws error', () => {
                req.user = { groups: [groups.regular] };
                checkClassPermissions(req, res, next);
                expect(next).not.toHaveBeenCalled();
                expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
            });

            test('readonly throws error', () => {
                req.user = { groups: [groups.readonly] };
                checkClassPermissions(req, res, next);
                expect(next).not.toHaveBeenCalled();
                expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
            });
        });

        describe('read', () => {
            beforeEach(() => {
                req.method = 'GET';
            });

            test('admin calls next', () => {
                req.user = { groups: [groups.admin] };
                checkClassPermissions(req, res, next);
                expect(next).toHaveBeenCalled();
            });

            test('manager calls next', () => {
                req.user = { groups: [groups.manager] };
                checkClassPermissions(req, res, next);
                expect(next).toHaveBeenCalled();
            });

            test('regular calls next', () => {
                req.user = { groups: [groups.regular] };
                checkClassPermissions(req, res, next);
                expect(next).toHaveBeenCalled();
            });

            test('readonly calls next', () => {
                req.user = { groups: [groups.readonly] };
                checkClassPermissions(req, res, next);
                expect(next).toHaveBeenCalled();
            });
        });

        describe('update', () => {
            beforeEach(() => {
                req.method = 'PATCH';
            });

            test('admin calls next', () => {
                req.user = { groups: [groups.admin] };
                checkClassPermissions(req, res, next);
                expect(next).toHaveBeenCalled();
            });

            test('manager calls next', () => {
                req.user = { groups: [groups.manager] };
                checkClassPermissions(req, res, next);
                expect(next).toHaveBeenCalled();
            });

            test('regular throws error', () => {
                req.user = { groups: [groups.regular] };
                checkClassPermissions(req, res, next);
                expect(next).not.toHaveBeenCalled();
                expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
            });

            test('readonly throws error', () => {
                req.user = { groups: [groups.readonly] };
                checkClassPermissions(req, res, next);
                expect(next).not.toHaveBeenCalled();
                expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
            });
        });

        describe('delete', () => {
            beforeEach(() => {
                req.method = 'DELETE';
            });

            test('admin calls next', () => {
                req.user = { groups: [groups.admin] };
                checkClassPermissions(req, res, next);
                expect(next).toHaveBeenCalled();
            });

            test('manager calls next', () => {
                req.user = { groups: [groups.manager] };
                checkClassPermissions(req, res, next);
                expect(next).toHaveBeenCalled();
            });

            test('regular throws error', () => {
                req.user = { groups: [groups.regular] };
                checkClassPermissions(req, res, next);
                expect(next).not.toHaveBeenCalled();
                expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
            });

            test('readonly throws error', () => {
                req.user = { groups: [groups.readonly] };
                checkClassPermissions(req, res, next);
                expect(next).not.toHaveBeenCalled();
                expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
            });
        });
    });

    describe('source', () => {
        beforeEach(() => {
            req = { model: Source };
        });

        describe('create', () => {
            beforeEach(() => {
                req.method = 'POST';
            });

            test('admin calls next', () => {
                req.user = { groups: [groups.admin] };
                checkClassPermissions(req, res, next);
                expect(next).toHaveBeenCalled();
            });

            test('manager calls next', () => {
                req.user = { groups: [groups.manager] };
                checkClassPermissions(req, res, next);
                expect(next).toHaveBeenCalled();
            });

            test('regular calls next', () => {
                req.user = { groups: [groups.regular] };
                checkClassPermissions(req, res, next);
                expect(next).toHaveBeenCalled();
            });

            test('readonly throws error', () => {
                req.user = { groups: [groups.readonly] };
                checkClassPermissions(req, res, next);
                expect(next).not.toHaveBeenCalled();
                expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
            });
        });

        describe('read', () => {
            beforeEach(() => {
                req.method = 'GET';
            });

            test('admin calls next', () => {
                req.user = { groups: [groups.admin] };
                checkClassPermissions(req, res, next);
                expect(next).toHaveBeenCalled();
            });

            test('manager calls next', () => {
                req.user = { groups: [groups.manager] };
                checkClassPermissions(req, res, next);
                expect(next).toHaveBeenCalled();
            });

            test('regular calls next', () => {
                req.user = { groups: [groups.regular] };
                checkClassPermissions(req, res, next);
                expect(next).toHaveBeenCalled();
            });

            test('readonly calls next', () => {
                req.user = { groups: [groups.readonly] };
                checkClassPermissions(req, res, next);
                expect(next).toHaveBeenCalled();
            });
        });

        describe('update', () => {
            beforeEach(() => {
                req.method = 'PATCH';
            });


            test('admin calls next', () => {
                req.user = { groups: [groups.admin] };
                checkClassPermissions(req, res, next);
                expect(next).toHaveBeenCalled();
            });

            test('manager calls next', () => {
                req.user = { groups: [groups.manager] };
                checkClassPermissions(req, res, next);
                expect(next).toHaveBeenCalled();
            });

            test('regular calls next', () => {
                req.user = { groups: [groups.regular] };
                checkClassPermissions(req, res, next);
                expect(next).toHaveBeenCalled();
            });

            test('readonly throws error', () => {
                req.user = { groups: [groups.readonly] };
                checkClassPermissions(req, res, next);
                expect(next).not.toHaveBeenCalled();
                expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
            });
        });

        describe('delete', () => {
            beforeEach(() => {
                req.method = 'DELETE';
            });


            test('admin calls next', () => {
                req.user = { groups: [groups.admin] };
                checkClassPermissions(req, res, next);
                expect(next).toHaveBeenCalled();
            });

            test('manager throws error', () => {
                req.user = { groups: [groups.manager] };
                checkClassPermissions(req, res, next);
                expect(next).not.toHaveBeenCalled();
                expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
            });

            test('regular throws error', () => {
                req.user = { groups: [groups.regular] };
                checkClassPermissions(req, res, next);
                expect(next).not.toHaveBeenCalled();
                expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
            });

            test('readonly throws error', () => {
                req.user = { groups: [groups.readonly] };
                checkClassPermissions(req, res, next);
                expect(next).not.toHaveBeenCalled();
                expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.FORBIDDEN);
            });
        });
    });
});
