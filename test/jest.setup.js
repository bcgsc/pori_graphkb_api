jest.mock('orientjs', () => {
    class MockRID {
        constructor(value = { cluster: 1, position: 1 }) {
            if (typeof value === 'string') {
                this.value = value;
            } else {
                const cluster = value.cluster ?? 1;
                const position = value.position ?? 1;
                this.value = `#${cluster}:${position}`;
            }
        }

        toString() {
            return this.value;
        }

        valueOf() {
            return this.value;
        }

        [Symbol.toPrimitive]() {
            return this.value;
        }
    }

    return {
        RID: MockRID,
        RecordID: MockRID,
        types: {},
        OrientDBClient: {
            connect: jest.fn(),
        },
    };
});
